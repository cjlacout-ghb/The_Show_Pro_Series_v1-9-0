"use server";

import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = "cjlacout.antigravity@gmail.com";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bqfcfqflodpewdssicak.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_2par32BiPa4FahajE_7vog_XbZ46--K';

function getRequestClient(token?: string) {
    if (!token) return supabase;
    return createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

async function verifyAdmin(client: any) {
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user || user.email !== ADMIN_EMAIL) {
        throw new Error("No autorizado");
    }
}

export async function getAwards() {
    const { data, error } = await supabase
        .from('awards')
        .select('*')
        .order('id');

    if (error) {
        console.error("Error fetching awards:", error);
        return [];
    }
    if (error) {
        console.error("Error fetching awards:", error);
        return [];
    }
    console.log(`[getAwards] Fetched ${data.length} awards from DB`);
    data.forEach((a: any) => console.log(` - Found: "${a.title}" (${a.category})`));

    return data.map((a: any) => ({
        id: a.id,
        category: a.category,
        title: a.title,
        playerName: a.player_name,
        teamName: a.team_name,
        description: a.description
    }));
}

export async function saveAward(data: { id?: number, category: string, title: string, playerName: string, teamName: string, description: string, token?: string }) {
    const client = getRequestClient(data.token);
    await verifyAdmin(client);

    const awardData = {
        category: data.category,
        title: data.title,
        player_name: data.playerName,
        team_name: data.teamName,
        description: data.description,
        updated_at: new Date().toISOString()
    };

    let error;
    if (data.id) {
        ({ error } = await client.from('awards').update(awardData).eq('id', data.id));
    } else {
        ({ error } = await client.from('awards').insert(awardData));
    }

    if (error) {
        console.error("Error saving award:", error);
        throw new Error(error.message);
    }
    revalidatePath('/');
}

export async function importAwardsFromTxt(txtData: string, token?: string) {
    const client = getRequestClient(token);
    await verifyAdmin(client);

    const lines = txtData.split('\n');
    let currentCategory: 'ronda_inicial' | 'partido_final' = 'ronda_inicial';
    const awards: any[] = [];

    let i = 0;
    while (i < lines.length) {
        const line = lines[i].trim();

        if (line.startsWith('SECTION:')) {
            const sectionName = line.replace('SECTION:', '').trim().toUpperCase();
            if (sectionName.includes('PARTIDO_FINAL')) {
                currentCategory = 'partido_final';
            } else {
                currentCategory = 'ronda_inicial';
            }
        } else if (line.startsWith('PREMIO:')) {
            const rawTitle = line.replace('PREMIO:', '').trim();
            let canonicalTitle = "";
            let isTeam = false;

            if (rawTitle.toUpperCase().includes('BATEADOR')) canonicalTitle = "MEJOR BATEADOR DEL TORNEO";
            else if (rawTitle.toUpperCase().includes('ALL_THE_SHOW_TEAM') || rawTitle.toUpperCase().includes('EQUIPO IDEAL')) {
                canonicalTitle = "ALL THE SHOW TEAM";
                isTeam = true;
            }
            else if (rawTitle.toUpperCase().includes('LANZADOR')) canonicalTitle = "LANZADOR DESTACADO";
            else if (rawTitle.toUpperCase().includes('MVP')) canonicalTitle = "JUGADOR MVP";

            if (canonicalTitle) {
                console.log(`[IMPORT] Match found: ${canonicalTitle} (Team: ${isTeam})`);
                if (isTeam) {
                    console.log("[IMPORT] Starting Team Parsing...");
                    let players: string[] = [];
                    i++;
                    while (i < lines.length) {
                        const rawLine = lines[i];
                        const cleanLine = rawLine?.trim() || "";

                        // Stop if we hit a new section or award, but ONLY if it's not a player line
                        if (cleanLine.startsWith('PREMIO:') || cleanLine.startsWith('SECTION:')) {
                            console.log(`[IMPORT] Stopping team parse at: ${cleanLine}`);
                            break;
                        }

                        if (cleanLine && !cleanLine.startsWith('//') && !cleanLine.startsWith('GANADOR:') && !cleanLine.startsWith('EQUIPO:') && !cleanLine.startsWith('ESTADÍSTICAS:')) {
                            console.log(`[IMPORT] Adding player: ${cleanLine}`);
                            players.push(cleanLine);
                        }
                        i++;
                    }
                    i--; // Step back so the outer loop processes the SECTION/PREMIO line next

                    const teamDesc = players.join('\n');
                    console.log(`[IMPORT] Finished Team Parse. Total players: ${players.length}`);
                    console.log(`[IMPORT] Team Description Payload (First 20 chars): ${teamDesc.substring(0, 20)}...`);

                    awards.push({
                        category: currentCategory,
                        title: canonicalTitle,
                        player_name: "EQUIPO IDEAL",
                        team_name: "SELECCIÓN DEL TORNEO",
                        description: teamDesc,
                        updated_at: new Date().toISOString()
                    });
                } else {
                    // ... existing individual logic ...
                    let playerName = "";
                    let teamName = "";
                    let description = "";
                    i++;
                    while (i < lines.length) {
                        const rawLine = lines[i];
                        const cleanLine = rawLine?.trim() || "";

                        if (cleanLine.startsWith('PREMIO:') || cleanLine.startsWith('SECTION:')) {
                            break;
                        }

                        if (cleanLine.startsWith('GANADOR:')) playerName = cleanLine.replace('GANADOR:', '').trim();
                        else if (cleanLine.startsWith('EQUIPO:')) teamName = cleanLine.replace('EQUIPO:', '').trim();
                        else if (cleanLine.startsWith('ESTADÍSTICAS:')) description = cleanLine.replace('ESTADÍSTICAS:', '').trim();
                        i++;
                    }
                    i--;
                    console.log(`[IMPORT] Parsed award: ${canonicalTitle} for ${playerName}`);
                    awards.push({
                        category: currentCategory,
                        title: canonicalTitle,
                        player_name: playerName,
                        team_name: teamName,
                        description: description,
                        updated_at: new Date().toISOString()
                    });
                }
            } else {
                console.warn(`[IMPORT] No canonical title match for: ${rawTitle}`);
            }
        }
        i++;
    }

    console.log(`[IMPORT] Preparing to upsert ${awards.length} awards..`);

    // --- POST-PARSE VERIFICATION & FALLBACK ---

    // Check if ALL THE SHOW TEAM was captured
    const hasAllStar = awards.some(a => a.title === "ALL THE SHOW TEAM");

    if (!hasAllStar) {
        console.warn("[IMPORT] 'ALL THE SHOW TEAM' missing from standard parse. Attempting Regex Fallback...");

        // Regex to match the section between the Header and the next Section/Premio
        // identifying "PREMIO: ALL_THE_SHOW_TEAM" up to the next "SECTION:" or "PREMIO:"
        const allStarRegex = /PREMIO:\s*ALL_THE_SHOW_TEAM[\s\S]*?(?=SECTION:|PREMIO:|$)/i;
        const match = txtData.match(allStarRegex);

        if (match) {
            const block = match[0];
            const lines = block.split('\n')
                .map(l => l.trim())
                .filter(l => l && !l.startsWith('PREMIO:') && !l.startsWith('//') && !l.includes('GANADOR:') && !l.includes('EQUIPO:'));

            if (lines.length > 0) {
                console.log(`[IMPORT] Regex Fallback found ${lines.length} players.`);
                awards.push({
                    category: 'ronda_inicial',
                    title: 'ALL THE SHOW TEAM',
                    player_name: "EQUIPO IDEAL",
                    team_name: "SELECCIÓN DEL TORNEO",
                    description: lines.join('\n'),
                    updated_at: new Date().toISOString()
                });
            }
        }
    }

    // Deduplicate awards array just in case
    const uniqueAwards = Array.from(new Map(awards.map(item => [item.category + item.title, item])).values());

    console.log(`[IMPORT] Final Payload: ${uniqueAwards.length} awards prepared for storage.`);

    // Upsert
    for (const award of uniqueAwards) {
        console.log(`[IMPORT] Upserting: "${award.title}" (${award.category})`);
        const { error } = await client.from('awards').upsert(award, { onConflict: 'category,title' });
        if (error) {
            console.error(`[IMPORT ERROR] Failed to save "${award.title}":`, error.message);
        } else {
            console.log(`[IMPORT] Success: "${award.title}"`);
        }
    }

    revalidatePath('/');
}
