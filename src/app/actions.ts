"use server";

import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { parseGameStats } from '@/lib/stats-parser'

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
    batting_stats?: any[];
    pitching_stats?: any[];
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

    // Map snake_case to camelCase for the UI and handle team replacement
    return (teams as DBTeam[]).map(team => {
        const isMayo = team.name === "MAYO'S (MEX)";
        return {
            ...team,
            name: isMayo ? "ARGENTINA U23 (ARG)" : team.name,
            players: team.players.map((p: any) => ({
                ...p,
                placeOfBirth: isMayo ? "ARGENTINA" : p.place_of_birth
            }))
        };
    })
}

export async function getGames() {
    // Fetch games first
    const { data: games, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .order('id')

    if (gamesError) {
        console.error('Error fetching games:', gamesError)
        return []
    }

    // Fetch all batting stats
    const { data: battingStats, error: bError } = await supabase
        .from('batting_stats')
        .select('*')

    if (bError) {
        console.error('Error fetching batting_stats:', bError)
    }

    // Fetch all pitching stats
    const { data: pitchingStats, error: pError } = await supabase
        .from('pitching_stats')
        .select('*')

    if (pError) {
        console.error('Error fetching pitching_stats:', pError)
    }

    console.log(`[getGames] Fetched ${games?.length} games, ${battingStats?.length || 0} batting stats, ${pitchingStats?.length || 0} pitching stats`);

    // Helper to flatten stats from JSONB column
    const flattenStat = (dbRow: any) => {
        if (!dbRow) return null;
        // The stats are stored in a JSONB 'stats' column
        const statsData = dbRow.stats || {};
        return {
            playerId: dbRow.player_id,
            gameId: dbRow.game_id,
            ...statsData
        };
    };

    // Map stats to games
    return (games as DBGame[]).map(game => {
        const gameBattingStats = (battingStats || [])
            .filter((s: any) => s.game_id === game.id)
            .map(flattenStat)
            .filter(Boolean);
        const gamePitchingStats = (pitchingStats || [])
            .filter((s: any) => s.game_id === game.id)
            .map(flattenStat)
            .filter(Boolean);

        return {
            ...game,
            team1Id: String(game.team1_id),
            team2Id: String(game.team2_id),
            score1: game.score1?.toString() ?? "",
            score2: game.score2?.toString() ?? "",
            hits1: game.hits1?.toString() ?? "",
            hits2: game.hits2?.toString() ?? "",
            errors1: game.errors1?.toString() ?? "",
            errors2: game.errors2?.toString() ?? "",
            innings: game.innings || [],
            battingStats: gameBattingStats,
            pitchingStats: gamePitchingStats,
            isChampionship: game.id === 16
        };
    })
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

function mapToCamelCase(obj: any) {
    const result: any = {};
    if (!obj) return result;
    for (const key in obj) {
        const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        result[camelKey] = obj[key];
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

export async function importPlayers(teamId: number, csvData: string, token?: string, replace: boolean = false) {
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

    if (replace && teamId) {
        console.log(`[ACTION] Replacing roster for Team ${teamId}. Deleting old players...`);
        // Be careful: if we delete players, we lose their stats unless we duplicate IDs (which we can't easily do from CSV without checking names).
        // Since the user asked for "Brand new list", we assume a fresh start or fixing a roster.
        const { error: deleteError } = await client
            .from('players')
            .delete()
            .eq('team_id', teamId);

        if (deleteError) {
            console.error('Error deleting old roster:', deleteError);
            return { success: false, error: "Error al borrar roster anterior: " + deleteError.message };
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

export async function importGameStatsFromTxt(gameId: number, txtData: string, token?: string) {
    console.log(`[ACTION] Importing stats for game ${gameId}`);
    const client = getRequestClient(token);
    await verifyAdmin(client, token);

    const parsedData = parseGameStats(txtData);

    // Verify game ID matches
    if (parsedData.gameId && parsedData.gameId !== gameId) {
        throw new Error(`El archivo contiene datos para el Juego ${parsedData.gameId}, pero estás intentando importar en el Juego ${gameId}.`);
    }

    // 1. Fetch current game info to know teams
    const { data: game, error: gameError } = await client
        .from('games')
        .select('team1_id, team2_id')
        .eq('id', gameId)
        .single();

    if (gameError || !game) throw new Error("No se encontró el juego.");

    // Assumption: Team 1 is Visitor, Team 2 is Local.
    const team1Id = game.team1_id;
    const team2Id = game.team2_id;

    if (!team1Id || !team2Id) throw new Error("El juego no tiene equipos asignados todavía.");

    // 2. Fetch all players for these teams to match names efficiently
    const { data: players, error: playersError } = await client
        .from('players')
        .select('id, name, number, team_id')
        .in('team_id', [team1Id, team2Id]);

    if (playersError) throw new Error("Error obteniendo jugadores.");

    const findPlayer = (name: string, number: number, teamId: number) => {
        // First try finding by Number + Team (Closest match)
        const exactMatch = players?.find(p => p.team_id === teamId && p.number === number);
        if (exactMatch) return exactMatch;

        // Fallback: finding by Name in that team (using a loose match)
        // Normalize: remove accents, lowercase
        const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/,/g, "");
        const targetName = normalize(name);

        return players?.find(p => p.team_id === teamId && normalize(p.name) === targetName);
    };

    // Helper to process batter list
    const processBatters = async (batters: any[], teamId: number) => {
        let successCount = 0;
        for (const b of batters) {
            const player = findPlayer(b.name, b.number, teamId);
            if (player) {
                console.log(`[IMPORT] Matched batter #${b.number} "${b.name}" to player ID ${player.id} (${player.name})`);
                // Database uses a JSONB 'stats' column, not individual columns
                const statsObj = {
                    plateAppearances: b.pa,
                    atBats: b.ab,
                    runs: b.r,
                    hits: b.h,
                    doubles: b.doubles,
                    triples: b.triples,
                    homeRuns: b.hr,
                    rbi: b.rbi,
                    walks: b.bb,
                    strikeOuts: b.so,
                    stolenBases: b.sb
                };
                const { error } = await client.from('batting_stats').upsert({
                    player_id: player.id,
                    game_id: gameId,
                    stats: statsObj,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'player_id,game_id' });
                if (error) {
                    console.error(`[IMPORT ERROR] Failed to upsert batter ${player.id}:`, error);
                } else {
                    successCount++;
                }
            } else {
                console.warn(`[WARN] Batter not found: #${b.number} ${b.name} (Team ${teamId})`);
            }
        }
        console.log(`[IMPORT] Processed ${successCount}/${batters.length} batters for team ${teamId}`);
    };

    // Helper to process pitcher list
    const processPitchers = async (pitchers: any[], teamId: number) => {
        let successCount = 0;
        for (const p of pitchers) {
            const player = findPlayer(p.name, p.number, teamId);
            if (player) {
                console.log(`[IMPORT] Matched pitcher #${p.number} "${p.name}" to player ID ${player.id} (${player.name})`);
                // Database uses a JSONB 'stats' column, not individual columns
                const statsObj = {
                    inningsPitched: p.ip,
                    hits: p.h,
                    runs: p.r,
                    earnedRuns: p.er,
                    walks: p.bb,
                    strikeOuts: p.so,
                    homeRuns: p.hr,
                    wins: p.w,
                    losses: p.l,
                    saves: p.s
                };
                const { error } = await client.from('pitching_stats').upsert({
                    player_id: player.id,
                    game_id: gameId,
                    stats: statsObj,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'player_id,game_id' });
                if (error) {
                    console.error(`[IMPORT ERROR] Failed to upsert pitcher ${player.id}:`, error);
                } else {
                    successCount++;
                }
            } else {
                console.warn(`[WARN] Pitcher not found: #${p.number} ${p.name} (Team ${teamId})`);
            }
        }
        console.log(`[IMPORT] Processed ${successCount}/${pitchers.length} pitchers for team ${teamId}`);
    }

    // 3. Update Game Scoreboard (Innings, R, H, E)
    // Construct innings array: zip visitor and local innings
    // The format in DB is [[rVis, rLoc], [rVis, rLoc], ...]
    const inningsArray: string[][] = [];
    const maxInnings = Math.max(parsedData.visitorInnings.length, parsedData.localInnings.length);
    for (let i = 0; i < maxInnings; i++) {
        inningsArray.push([
            parsedData.visitorInnings[i] || "",
            parsedData.localInnings[i] || ""
        ]);
    }

    await client.from('games').update({
        score1: parsedData.visitorRHE.r,
        hits1: parsedData.visitorRHE.h,
        errors1: parsedData.visitorRHE.e,
        score2: parsedData.localRHE.r,
        hits2: parsedData.localRHE.h,
        errors2: parsedData.localRHE.e,
        innings: inningsArray
    }).eq('id', gameId);

    // 4. Process Player Stats
    // Visitor = team1, Local = team2 (By convention in schedule-card)
    await processBatters(parsedData.visitorBatters, team1Id);
    await processBatters(parsedData.localBatters, team2Id);

    await processPitchers(parsedData.visitorPitchers, team1Id);
    await processPitchers(parsedData.localPitchers, team2Id);

    revalidatePath('/');
    return { success: true };
}
