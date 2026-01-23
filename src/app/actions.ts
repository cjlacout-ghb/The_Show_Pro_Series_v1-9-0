"use server";

import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

const ADMIN_EMAIL = "cjlacout.antigravity@gmail.com";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bqfcfqflodpewdssicak.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_2par32BiPa4FahajE_7vog_XbZ46--K';

/**
 * Creates a dedicated supabase client for a single request
 * to ensure auth state doesn't leak or get lost.
 */
function getRequestClient(token?: string) {
    if (!token) return supabase;

    return createClient(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: { Authorization: `Bearer ${token}` }
        },
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        }
    });
}

async function verifyAdmin(client: any, _token?: string) {
    const { data: { user }, error } = await client.auth.getUser();

    if (error) {
        console.error("Auth error:", error.message);
        throw new Error(`Error de sesión: ${error.message}`);
    }

    if (!user || user.email !== ADMIN_EMAIL) {
        console.log(`[AUTH] Unauthorized attempt by: ${user?.email || 'None'}`);
        throw new Error(`Acceso no autorizado. (Usuario detectado: ${user?.email || 'Ninguno'})`);
    }
}

interface DBTeam {
    id: number;
    name: string;
    logo_url: string;
    players: any[];
}

interface DBGame {
    id: number;
    team1_id: number;
    team2_id: number;
    score1: number | null;
    score2: number | null;
    hits1: number | null;
    hits2: number | null;
    errors1: number | null;
    errors2: number | null;
    innings: any[];
}

export async function getTeams() {
    const { data: teams, error } = await supabase
        .from('teams')
        .select(`
            *,
            players (*)
        `)
        .order('id')

    if (error) {
        console.error('Error fetching teams:', error)
        return []
    }

    // Map snake_case to camelCase for the UI
    return (teams as DBTeam[]).map(team => ({
        ...team,
        players: team.players.map((p: any) => ({
            ...p,
            placeOfBirth: p.place_of_birth
        }))
    }))
}

export async function getGames() {
    const { data: games, error } = await supabase
        .from('games')
        .select('*')
        .order('id')

    if (error) {
        console.error('Error fetching games:', error)
        return []
    }

    return (games as DBGame[]).map(game => ({
        ...game,
        team1Id: String(game.team1_id),
        team2Id: String(game.team2_id),
        score1: game.score1?.toString() ?? "",
        score2: game.score2?.toString() ?? "",
        hits1: game.hits1?.toString() ?? "",
        hits2: game.hits2?.toString() ?? "",
        errors1: game.errors1?.toString() ?? "",
        errors2: game.errors2?.toString() ?? "",
        isChampionship: game.id === 16
    }))
}

export async function saveBattingStat(data: { playerId: number, gameId: number, stats: any, token?: string }) {
    console.log(`[ACTION] Saving batting stats for player ${data.playerId} in game ${data.gameId}`);
    const client = getRequestClient(data.token);
    await verifyAdmin(client, data.token);

    // Map camelCase keys to snake_case for DB
    const mappedStats = mapToSnakeCase(data.stats);

    const { error } = await client
        .from('batting_stats')
        .upsert({
            player_id: data.playerId,
            game_id: data.gameId,
            ...mappedStats,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'player_id,game_id'
        });

    if (error) {
        console.error('Error saving batting stat:', error);
        throw new Error(`Error en base de datos: ${error.message}`);
    }
    revalidatePath('/');
}

export async function savePitchingStat(data: { playerId: number, gameId: number, stats: any, token?: string }) {
    console.log(`[ACTION] Saving pitching stats for player ${data.playerId} in game ${data.gameId}`);
    const client = getRequestClient(data.token);
    await verifyAdmin(client, data.token);

    // Map camelCase keys to snake_case for DB
    const mappedStats = mapToSnakeCase(data.stats);

    const { error } = await client
        .from('pitching_stats')
        .upsert({
            player_id: data.playerId,
            game_id: data.gameId,
            ...mappedStats,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'player_id,game_id'
        });

    if (error) {
        console.error('Error saving pitching stat:', error);
        throw new Error(`Error en base de datos: ${error.message}`);
    }
    revalidatePath('/');
}

function mapToSnakeCase(obj: any) {
    const result: any = {};
    if (!obj) return result;
    for (const key in obj) {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        result[snakeKey] = obj[key];
    }
    return result;
}

export async function getAllStats() {
    const { data: bStats, error: bError } = await supabase
        .from('batting_stats')
        .select(`
            *,
            player:players (
                *,
                team:teams (*)
            )
        `)

    const { data: pStats, error: pError } = await supabase
        .from('pitching_stats')
        .select(`
            *,
            player:players (
                *,
                team:teams (*)
            )
        `)

    if (bError || pError) console.error('Error fetching all stats:', bError || pError)

    // Map structure to match frontend expectations
    const mapStat = (stat: any) => ({
        ...stat,
        playerId: stat.player_id,
        gameId: stat.game_id,
        player: {
            ...stat.player,
            placeOfBirth: stat.player.place_of_birth,
            team: stat.player.team
        }
    })

    return {
        battingStats: (bStats || []).map(mapStat),
        pitchingStats: (pStats || []).map(mapStat)
    };
}

export async function updateGame(gameId: number, data: any, token?: string) {
    console.log(`[ACTION] Updating game ${gameId}`);
    const client = getRequestClient(token);
    await verifyAdmin(client, token);
    const updateData: any = {}

    // Helper to safely parse numbers and handle empty strings/NaN
    const safeNum = (v: any) => {
        if (v === "" || v === null || v === undefined) return null;
        const n = parseInt(v);
        return isNaN(n) ? null : n;
    }

    if (data.score1 !== undefined) updateData.score1 = safeNum(data.score1)
    if (data.score2 !== undefined) updateData.score2 = safeNum(data.score2)
    if (data.hits1 !== undefined) updateData.hits1 = safeNum(data.hits1)
    if (data.hits2 !== undefined) updateData.hits2 = safeNum(data.hits2)
    if (data.errors1 !== undefined) updateData.errors1 = safeNum(data.errors1)
    if (data.errors2 !== undefined) updateData.errors2 = safeNum(data.errors2)
    if (data.innings !== undefined) updateData.innings = data.innings

    if (data.team1Id !== undefined) updateData.team1_id = safeNum(data.team1Id)
    if (data.team2Id !== undefined) updateData.team2_id = safeNum(data.team2Id)

    const { error } = await client
        .from('games')
        .update(updateData)
        .eq('id', gameId)

    if (error) {
        console.error('Error updating game:', error)
        throw new Error(`Error al actualizar partido: ${error.message}`);
    }
    revalidatePath('/')
}

export async function importPlayers(teamId: number, csvData: string, token?: string) {
    const client = getRequestClient(token);
    await verifyAdmin(client, token);
    const lines = csvData.trim().split('\n');
    const playersToInsert: any[] = [];


    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.includes('UNIFORME N') || trimmedLine.toUpperCase().startsWith('TEAM')) continue;

        let parts = trimmedLine.split(',').map(p => p.trim());
        if (parts.length < 3) parts = trimmedLine.split('\t').map(p => p.trim());

        if (parts.length >= 2) {
            const number = parseInt(parts[0]) || 0;
            let fullName = "";
            let role = "UNKNOWN";
            let placeOfBirth = "UNKNOWN";

            if (parts.length >= 3) {
                const lastName = parts[1] || "";
                const firstName = parts[2] || "";
                fullName = `${firstName} ${lastName}`.trim();
                if (parts.length > 3) role = parts[3];
                if (parts.length > 4) placeOfBirth = parts[4];
            } else {
                fullName = parts[1];
            }

            playersToInsert.push({
                id: Math.floor(Math.random() * 100000000), // Larger random ID to avoid collisions
                team_id: teamId,
                number: number,
                name: fullName,
                role: role,
                place_of_birth: placeOfBirth
            });
        }
    }

    if (playersToInsert.length > 0) {
        const { error, count } = await client.from('players').insert(playersToInsert)
        if (error) {
            console.error('Error importing players:', error)
            return { success: false, error: error.message }
        }
        revalidatePath('/');
        return { success: true, count: playersToInsert.length };
    }

    return { success: true, count: 0 };
}

export async function updatePlayer(playerId: number, data: { number?: number, name?: string, role?: string, placeOfBirth?: string }, token?: string) {
    const client = getRequestClient(token);
    await verifyAdmin(client, token);
    const updateData: any = { ...data }
    if (data.placeOfBirth) {
        updateData.place_of_birth = data.placeOfBirth
        delete updateData.placeOfBirth
    }

    const { error } = await client
        .from('players')
        .update(updateData)
        .eq('id', playerId)

    if (error) {
        console.error('Error updating player:', error)
        return { success: false }
    }
    revalidatePath('/');
    return { success: true };
}



export async function resetTournamentScores(token?: string) {
    try {
        const client = getRequestClient(token);
        await verifyAdmin(client, token);
        console.log('Starting full tournament reset...');

        // 1. Delete all batting stats
        const { error: bError, count: bCount } = await client
            .from('batting_stats')
            .delete({ count: 'exact' })
            .gte('player_id', 0);

        if (bError) {
            console.error('Error clearing batting stats:', bError);
            throw new Error(`Error en batting_stats: ${bError.message}`);
        }
        console.log(`Deleted ${bCount} batting stats.`);

        // 2. Delete all pitching stats
        const { error: pError, count: pCount } = await client
            .from('pitching_stats')
            .delete({ count: 'exact' })
            .gte('player_id', 0);

        if (pError) {
            console.error('Error clearing pitching stats:', pError);
            throw new Error(`Error en pitching_stats: ${pError.message}`);
        }
        console.log(`Deleted ${pCount} pitching stats.`);

        // 3. Reset all games scores, innings, hits, and errors
        const { data: updatedGames, error: error1 } = await client
            .from('games')
            .update({
                score1: null,
                score2: null,
                hits1: null,
                hits2: null,
                errors1: null,
                errors2: null,
                innings: []
            })
            .gte('id', 0)
            .select();

        if (error1) {
            console.error('Error resetting games:', error1);
            throw new Error(`Error al resetear juegos: ${error1.message}`);
        }

        if (!updatedGames || updatedGames.length === 0) {
            console.warn('Warning: No games were updated during reset. This might indicate an RLS policy issue.');
            throw new Error('No se pudieron actualizar los juegos. Verifique los permisos RLS en Supabase.');
        }

        console.log(`Updated ${updatedGames.length} games.`);

        // 4. Specifically reset team assignments for the championship game (ID 16)
        const { error: error2 } = await client
            .from('games')
            .update({
                team1_id: null,
                team2_id: null
            })
            .eq('id', 16);

        if (error2) {
            console.error('Error resetting championship game teams:', error2);
            throw new Error(`Error en juego 16: ${error2.message}`);
        }

        console.log('Reset successful and verified.');
        revalidatePath('/');
        return { success: true };
    } catch (err: any) {
        console.error('Reset action failed:', err);
        return { success: false, error: err.message || 'Error desconocido al reiniciar el torneo' };
    }
}
