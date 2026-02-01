"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trophy, Award as AwardIcon, Star, User, Shield, Upload } from "lucide-react";
import { getAwards, saveAward, importAwardsFromTxt } from "@/app/awards-actions";
import type { Award } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

interface AwardsSectionProps {
    isAdmin?: boolean;
}

export default function AwardsSection({ isAdmin }: AwardsSectionProps) {
    const [awards, setAwards] = useState<Award[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<Partial<Award>>({});
    const { toast } = useToast();

    useEffect(() => {
        loadAwards();
    }, []);

    async function loadAwards() {
        setLoading(true);
        try {
            const data = await getAwards();
            console.log("Client Received Awards:", data);
            setAwards(data);
        } catch (error) {
            console.error("Failed to load awards", error);
        } finally {
            setLoading(false);
        }
    }

    const handleSave = async (category: 'ronda_inicial' | 'partido_final', title: string) => {
        const award = awards.find(a => a.category === category && a.title === title);
        const form = editForm;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            await saveAward({
                id: award?.id,
                category,
                title,
                playerName: form.playerName || "",
                teamName: form.teamName || "",
                description: form.description || "",
                token: session?.access_token
            });
            toast({ title: "Premio guardado con éxito" });
            setEditingId(null);
            loadAwards();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error al guardar", description: error.message });
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const txt = event.target?.result as string;
            try {
                const { data: { session } } = await supabase.auth.getSession();
                await importAwardsFromTxt(txt, session?.access_token);
                toast({ title: "Premios importados con éxito" });
                loadAwards();
            } catch (error: any) {
                toast({ variant: "destructive", title: "Error al importar", description: error.message });
            }
        };
        reader.readAsText(file);
    };

    const renderAward = (category: 'ronda_inicial' | 'partido_final', title: string, defaultDesc: string) => {
        const award = awards.find(a => a.category === category && a.title === title);

        // Debug fallback
        if (!award && isAdmin) {
            return (
                <div className="p-4 border border-red-500/50 rounded-xl bg-red-500/10 mb-4">
                    <p className="text-red-400 font-bold text-xs uppercase">Datos no encontrados</p>
                    <p className="text-red-300 text-[10px]">Buscando: {title} ({category})</p>
                </div>
            )
        }

        const isEditing = editingId === (award?.id || -1) || (editingId === 0 && !award && editForm.title === title);

        return (
            <div key={`${category}-${title}`} className="relative group p-6 rounded-2xl bg-zinc-900/50 border border-primary/10 hover:border-primary/30 transition-all duration-500 overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary transition-colors" />

                <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                    <div className="p-4 rounded-xl bg-primary/10 text-primary">
                        {title.includes('MVP') ? <Trophy className="w-8 h-8" /> :
                            title.includes('BATEADOR') ? <Star className="w-8 h-8" /> :
                                title.includes('LANZADOR') ? <AwardIcon className="w-8 h-8" /> :
                                    <Shield className="w-8 h-8" />}
                    </div>

                    <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                            <h4 className="font-black text-lg uppercase tracking-tight text-white">{title}</h4>
                            {isAdmin && !isEditing && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setEditingId(award?.id || 0);
                                        setEditForm(award || { category, title, playerName: '', teamName: '', description: defaultDesc });
                                    }}
                                    className="h-7 text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    Editar
                                </Button>
                            )}
                        </div>

                        {isEditing ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-black tracking-widest text-primary/60">Nombre del Jugador</Label>
                                    <Input
                                        value={editForm.playerName}
                                        onChange={e => setEditForm({ ...editForm, playerName: e.target.value })}
                                        className="bg-black/50 border-primary/20 h-9 font-bold"
                                        placeholder="Ingrese nombre..."
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-black tracking-widest text-primary/60">Equipo</Label>
                                    <Input
                                        value={editForm.teamName}
                                        onChange={e => setEditForm({ ...editForm, teamName: e.target.value })}
                                        className="bg-black/50 border-primary/20 h-9 font-bold"
                                        placeholder="Ingrese equipo..."
                                    />
                                </div>
                                <div className="md:col-span-2 space-y-1">
                                    <Label className="text-[10px] uppercase font-black tracking-widest text-primary/60">Descripción</Label>
                                    <Input
                                        value={editForm.description}
                                        onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                        className="bg-black/50 border-primary/20 h-9 font-bold"
                                        placeholder="Ingrese descripción..."
                                    />
                                </div>
                                <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} className="font-bold uppercase tracking-widest text-[10px]">Cancelar</Button>
                                    <Button size="sm" onClick={() => handleSave(category, title)} className="font-bold uppercase tracking-widest text-[10px]">Guardar</Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex flex-wrap gap-4">
                                    <div className="flex items-center gap-2">
                                        <User className="w-4 h-4 text-primary/60" />
                                        <span className={`font-black text-xl uppercase tracking-tighter ${award?.playerName ? 'text-primary' : 'text-primary/20'}`}>
                                            {award?.playerName || "Nombre del Jugador"}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Shield className="w-4 h-4 text-primary/60" />
                                        <span className={`font-bold text-sm uppercase tracking-widest ${award?.teamName ? 'text-muted-foreground' : 'text-muted-foreground/20'}`}>
                                            {award?.teamName || "Nombre del Equipo"}
                                        </span>
                                    </div>
                                </div>
                                <p className="text-xs font-medium text-muted-foreground/80 italic border-l-2 border-primary/10 pl-3 leading-relaxed whitespace-pre-line">
                                    {award?.description || defaultDesc}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-12 py-4">
            {isAdmin && (
                <div className="flex flex-col items-end gap-2 pr-2">
                    <div className="relative">
                        <input type="file" id="import-awards" className="hidden" accept=".txt" onChange={handleImport} />
                        <Button
                            variant="outline"
                            size="sm"
                            asChild
                            className="bg-black/40 border-primary/40 hover:border-primary/60 hover:bg-primary/5 text-white font-black uppercase tracking-widest text-[11px] h-10 px-5 rounded-xl transition-all shadow-2xl border-2 group/btn"
                        >
                            <label htmlFor="import-awards" className="cursor-pointer flex items-center gap-3">
                                <Upload className="w-4 h-4 text-white group-hover/btn:scale-110 transition-transform" />
                                IMPORTAR TXT
                            </label>
                        </Button>
                    </div>
                    <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-[0.2em]">
                        Formato: CATEGORIA | TITULO | JUGADOR | EQUIPO | DESC
                    </p>
                </div>
            )}

            <section className="space-y-6">
                <div className="flex items-center gap-4 mb-8">
                    <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent to-primary/20" />
                    <h3 className="font-black text-2xl uppercase tracking-tighter text-white flex items-center gap-3">
                        <Trophy className="w-6 h-6 text-primary" />
                        Ronda Inicial
                    </h3>
                    <div className="h-[2px] flex-1 bg-gradient-to-l from-transparent to-primary/20" />
                </div>

                <div className="grid grid-cols-1 gap-6">
                    {renderAward('ronda_inicial', 'MEJOR BATEADOR DEL TORNEO', 'Se otorga al jugador con el mejor desempeño ofensivo (Ronda Inicial).')}
                    {renderAward('ronda_inicial', 'ALL THE SHOW TEAM', 'Jugadores seleccionados para conformar el equipo ideal del torneo (Ronda Inicial).')}
                </div>
            </section>

            <section className="space-y-6">
                <div className="flex items-center gap-4 mb-8">
                    <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent to-primary/20" />
                    <h3 className="font-black text-2xl uppercase tracking-tighter text-white flex items-center gap-3">
                        <Star className="w-6 h-6 text-primary" />
                        Partido Final
                    </h3>
                    <div className="h-[2px] flex-1 bg-gradient-to-l from-transparent to-primary/20" />
                </div>

                <div className="grid grid-cols-1 gap-6">
                    {renderAward('partido_final', 'LANZADOR DESTACADO', 'Se premia al pitcher con la actuación más sobresaliente del juego final.')}
                    {renderAward('partido_final', 'JUGADOR MVP', 'Se otorga al atleta más determinante del juego final.')}
                </div>
            </section>
        </div>
    );
}
