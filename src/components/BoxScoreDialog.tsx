"use client";

import { useEffect } from "react";
import type { Game, Team, BattingStat, PitchingStat } from "@/lib/types";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ClipboardList, Trash2, Plus } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

import { Upload } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

// New Hooks
import { useBoxScoreStats } from "@/hooks/useBoxScoreStats";

interface BoxScoreDialogProps {
    game: Game;
    teams: Team[];
    onSaveBatting: (playerId: number, stats: Partial<BattingStat>) => Promise<void>;
    onSavePitching: (playerId: number, stats: Partial<PitchingStat>) => Promise<void>;
    isAdmin?: boolean;
    onImportStats?: (text: string) => Promise<void>;
}

export default function BoxScoreDialog({ game, teams, onSaveBatting, onSavePitching, isAdmin = false, onImportStats }: BoxScoreDialogProps) {
    const {
        selectedBatters,
        selectedPitchers,
        handleBattingChange,
        handlePitchingChange,
        getBattingStat,
        getPitchingStat,
        addBatter,
        removeBatter,
        addPitcher,
        removePitcher,
        initializeFromGame
    } = useBoxScoreStats(game.id, onSaveBatting, onSavePitching);

    const { toast } = useToast();
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [importText, setImportText] = useState("");
    const [isImporting, setIsImporting] = useState(false);

    const handleImport = async () => {
        if (!onImportStats) return;
        setIsImporting(true);
        try {
            await onImportStats(importText);
            toast({
                title: "Importación Exitosa",
                description: "Las estadísticas se han cargado correctamente."
            });
            setIsImportOpen(false);
            setImportText("");
            // Force re-initialize stats
            initializeFromGame(game);
            // We might need to reload the page or trigger a refresh from parent to see changes in the schedule card immediately,
            // but initializeFromGame might handle internal state. The parent (ScheduleCard) data might be stale though.
            // Ideally onImportStats should trigger a router refresh in parent.
        } catch (error: any) {
            console.error(error);
            toast({
                variant: "destructive",
                title: "Error de Importación",
                description: error.message || "Verifique el formato del archivo."
            });
        } finally {
            setIsImporting(false);
        }
    };

    useEffect(() => {
        initializeFromGame(game);
    }, [game, initializeFromGame]);

    const team1 = teams.find(t => String(t.id) === game.team1Id);
    const team2 = teams.find(t => String(t.id) === game.team2Id);
    const allPlayersFromTeams = [...(team1?.players || []), ...(team2?.players || [])];

    // Group selected batters by team
    const team1Batters = selectedBatters.filter(id => team1?.players.some(p => p.id === id));
    const team2Batters = selectedBatters.filter(id => team2?.players.some(p => p.id === id));

    // Group selected pitchers by team
    const team1Pitchers = selectedPitchers.filter(id => team1?.players.some(p => p.id === id));
    const team2Pitchers = selectedPitchers.filter(id => team2?.players.some(p => p.id === id));

    const getTeamForPlayer = (playerId: number) => {
        if (team1?.players.some(p => p.id === playerId)) return team1;
        if (team2?.players.some(p => p.id === playerId)) return team2;
        return null;
    };

    const StatInput = ({ label, value, onChange, type = "number" }: any) => (
        <div className="flex flex-col gap-0.5">
            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-tighter font-mono text-center">{label}</Label>
            {isAdmin ? (
                <Input
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="h-7 text-sm font-mono font-bold tabular-nums text-center"
                />
            ) : (
                <div className="flex items-center justify-center h-7 text-sm font-mono font-bold tabular-nums bg-muted/20 border border-primary/5 rounded-md">
                    {value || "0"}
                </div>
            )}
        </div>
    );

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-2 text-xs font-bold hover:bg-primary/10 hover:text-primary transition-all">
                    <ClipboardList className="w-4 h-4" />
                    BOX SCORE
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl h-[90vh] p-0 overflow-hidden border-primary/20 flex flex-col">
                <DialogHeader className="py-3 px-4 bg-primary/5 border-b border-primary/10">
                    <DialogTitle className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <ClipboardList className="w-6 h-6 text-primary" />
                        </div>
                        Estadísticas del Partido
                    </DialogTitle>
                </DialogHeader>

                <Tabs defaultValue="batting" className="w-full flex-1 flex flex-col overflow-hidden">
                    <TabsList className="w-full justify-start rounded-none border-b border-primary/10 bg-muted/30 p-0 h-10 flex-shrink-0">
                        <TabsTrigger value="batting" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/5 px-8 h-full font-bold text-xs uppercase tracking-widest">Bateo</TabsTrigger>
                        <TabsTrigger value="pitching" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/5 px-8 h-full font-bold text-xs uppercase tracking-widest">Pitcheo</TabsTrigger>
                    </TabsList>

                    {isAdmin && (
                        <div className="absolute right-4 top-4">
                            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" variant="outline" className="gap-2 border-primary/20 text-[10px] font-black uppercase tracking-widest hover:border-primary hover:bg-primary/5">
                                        <Upload className="w-3 h-3" />
                                        Importar TXT
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-xl border-primary/20 bg-card/95 backdrop-blur-md">
                                    <DialogHeader>
                                        <DialogTitle className="text-xl font-black uppercase tracking-tighter">Importar desde TXT</DialogTitle>
                                    </DialogHeader>
                                    <div className="py-4">
                                        <Textarea
                                            value={importText}
                                            onChange={(e) => setImportText(e.target.value)}
                                            placeholder={`GAME_ID: ${game.id}\n...`}
                                            className="h-[300px] font-mono text-xs"
                                        />
                                    </div>
                                    <DialogFooter>
                                        <Button variant="ghost" onClick={() => setIsImportOpen(false)} className="text-[10px] font-bold uppercase tracking-widest">Cancelar</Button>
                                        <Button
                                            onClick={handleImport}
                                            disabled={isImporting || !importText.trim()}
                                            className="text-[10px] font-bold uppercase tracking-widest"
                                        >
                                            {isImporting ? "Procesando..." : "Importar Datos"}
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    )}


                    <TabsContent value="batting" className="p-0 m-0 flex-1 overflow-hidden">
                        <div className="p-4 bg-primary/[0.02] h-full flex flex-col">
                            {isAdmin && (
                                <div className="flex items-center gap-4 mb-4">
                                    <Select onValueChange={addBatter}>
                                        <SelectTrigger className="w-[300px] h-10 font-bold text-sm bg-background border-primary/20">
                                            <SelectValue placeholder="AGREGAR BATEADOR..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {allPlayersFromTeams
                                                .filter(p => !selectedBatters.includes(p.id))
                                                .map(p => (
                                                    <SelectItem key={p.id} value={String(p.id)} className="font-bold text-xs">
                                                        {p.name} ({teams.find(t => t.id === p.teamId)?.name})
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            <ScrollArea className="flex-1 pr-4">
                                <div className="space-y-4">
                                    {/* Team 1 Batters */}
                                    {team1Batters.length > 0 && (
                                        <div>
                                            <div className="text-xs font-black uppercase tracking-widest text-primary mb-2 border-b border-primary/20 pb-1">
                                                {team1?.name} (Visitante)
                                            </div>
                                            <div className="space-y-1.5">
                                                {team1Batters.map(playerId => {
                                                    const player = allPlayersFromTeams.find(p => p.id === playerId);
                                                    return (
                                                        <div key={playerId} className="flex flex-col gap-1.5 p-2.5 bg-background border border-primary/10 rounded-xl shadow-sm hover:border-primary/30 transition-all">
                                                            <div className="flex items-center justify-between">
                                                                <div className="font-mono font-black text-sm uppercase tracking-tight">
                                                                    #{player?.number} {player?.name}
                                                                </div>
                                                                {isAdmin && (
                                                                    <Button variant="ghost" size="sm" onClick={() => removeBatter(playerId)} className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/5">
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                                                                <StatInput label="PA" value={getBattingStat(playerId, "plateAppearances")} onChange={(v: string) => handleBattingChange(playerId, "plateAppearances", v)} />
                                                                <StatInput label="AB" value={getBattingStat(playerId, "atBats")} onChange={(v: string) => handleBattingChange(playerId, "atBats", v)} />
                                                                <StatInput label="H" value={getBattingStat(playerId, "hits")} onChange={(v: string) => handleBattingChange(playerId, "hits", v)} />
                                                                <StatInput label="R" value={getBattingStat(playerId, "runs")} onChange={(v: string) => handleBattingChange(playerId, "runs", v)} />
                                                                <StatInput label="RBI" value={getBattingStat(playerId, "rbi")} onChange={(v: string) => handleBattingChange(playerId, "rbi", v)} />
                                                                <StatInput label="HR" value={getBattingStat(playerId, "homeRuns")} onChange={(v: string) => handleBattingChange(playerId, "homeRuns", v)} />
                                                                <StatInput label="BB" value={getBattingStat(playerId, "walks")} onChange={(v: string) => handleBattingChange(playerId, "walks", v)} />
                                                                <StatInput label="SO" value={getBattingStat(playerId, "strikeOuts")} onChange={(v: string) => handleBattingChange(playerId, "strikeOuts", v)} />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Team 2 Batters */}
                                    {team2Batters.length > 0 && (
                                        <div>
                                            <div className="text-xs font-black uppercase tracking-widest text-primary mb-3 border-b border-primary/20 pb-2">
                                                {team2?.name} (Local)
                                            </div>
                                            <div className="space-y-3">
                                                {team2Batters.map(playerId => {
                                                    const player = allPlayersFromTeams.find(p => p.id === playerId);
                                                    return (
                                                        <div key={playerId} className="flex flex-col gap-3 p-4 bg-background border border-primary/10 rounded-xl shadow-sm hover:border-primary/30 transition-all">
                                                            <div className="flex items-center justify-between">
                                                                <div className="font-mono font-black text-sm uppercase tracking-tight">
                                                                    #{player?.number} {player?.name}
                                                                </div>
                                                                {isAdmin && (
                                                                    <Button variant="ghost" size="sm" onClick={() => removeBatter(playerId)} className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/5">
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                                                                <StatInput label="PA" value={getBattingStat(playerId, "plateAppearances")} onChange={(v: string) => handleBattingChange(playerId, "plateAppearances", v)} />
                                                                <StatInput label="AB" value={getBattingStat(playerId, "atBats")} onChange={(v: string) => handleBattingChange(playerId, "atBats", v)} />
                                                                <StatInput label="H" value={getBattingStat(playerId, "hits")} onChange={(v: string) => handleBattingChange(playerId, "hits", v)} />
                                                                <StatInput label="R" value={getBattingStat(playerId, "runs")} onChange={(v: string) => handleBattingChange(playerId, "runs", v)} />
                                                                <StatInput label="RBI" value={getBattingStat(playerId, "rbi")} onChange={(v: string) => handleBattingChange(playerId, "rbi", v)} />
                                                                <StatInput label="HR" value={getBattingStat(playerId, "homeRuns")} onChange={(v: string) => handleBattingChange(playerId, "homeRuns", v)} />
                                                                <StatInput label="BB" value={getBattingStat(playerId, "walks")} onChange={(v: string) => handleBattingChange(playerId, "walks", v)} />
                                                                <StatInput label="SO" value={getBattingStat(playerId, "strikeOuts")} onChange={(v: string) => handleBattingChange(playerId, "strikeOuts", v)} />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    </TabsContent>

                    <TabsContent value="pitching" className="p-0 m-0 flex-1 overflow-hidden">
                        <div className="p-4 bg-primary/[0.02] h-full flex flex-col">
                            {isAdmin && (
                                <div className="flex items-center gap-4 mb-4">
                                    <Select onValueChange={addPitcher}>
                                        <SelectTrigger className="w-[300px] h-10 font-bold text-sm bg-background border-primary/20">
                                            <SelectValue placeholder="AGREGAR LANZADOR..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {allPlayersFromTeams
                                                .filter(p => !selectedPitchers.includes(p.id))
                                                .map(p => (
                                                    <SelectItem key={p.id} value={String(p.id)} className="font-bold text-xs">
                                                        {p.name} ({teams.find(t => t.id === p.teamId)?.name})
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            <ScrollArea className="flex-1 pr-4">
                                <div className="space-y-4">
                                    {/* Team 1 Pitchers */}
                                    {team1Pitchers.length > 0 && (
                                        <div>
                                            <div className="text-xs font-black uppercase tracking-widest text-primary mb-2 border-b border-primary/20 pb-1">
                                                {team1?.name} (Visitante)
                                            </div>
                                            <div className="space-y-1.5">
                                                {team1Pitchers.map(playerId => {
                                                    const player = allPlayersFromTeams.find(p => p.id === playerId);
                                                    return (
                                                        <div key={playerId} className="flex flex-col gap-3 p-4 bg-background border border-primary/10 rounded-xl shadow-sm hover:border-primary/30 transition-all">
                                                            <div className="flex items-center justify-between">
                                                                <div className="font-mono font-black text-sm uppercase tracking-tight">
                                                                    #{player?.number} {player?.name}
                                                                </div>
                                                                {isAdmin && (
                                                                    <Button variant="ghost" size="sm" onClick={() => removePitcher(playerId)} className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/5">
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                                                                <StatInput label="IP" value={getPitchingStat(playerId, "inningsPitched")} onChange={(v: string) => handlePitchingChange(playerId, "inningsPitched", v)} type="text" />
                                                                <StatInput label="H" value={getPitchingStat(playerId, "hits")} onChange={(v: string) => handlePitchingChange(playerId, "hits", v)} />
                                                                <StatInput label="R" value={getPitchingStat(playerId, "runs")} onChange={(v: string) => handlePitchingChange(playerId, "runs", v)} />
                                                                <StatInput label="ER" value={getPitchingStat(playerId, "earnedRuns")} onChange={(v: string) => handlePitchingChange(playerId, "earnedRuns", v)} />
                                                                <StatInput label="BB" value={getPitchingStat(playerId, "walks")} onChange={(v: string) => handlePitchingChange(playerId, "walks", v)} />
                                                                <StatInput label="SO" value={getPitchingStat(playerId, "strikeOuts")} onChange={(v: string) => handlePitchingChange(playerId, "strikeOuts", v)} />
                                                                <StatInput label="W" value={getPitchingStat(playerId, "wins")} onChange={(v: string) => handlePitchingChange(playerId, "wins", v)} />
                                                                <StatInput label="L" value={getPitchingStat(playerId, "losses")} onChange={(v: string) => handlePitchingChange(playerId, "losses", v)} />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Team 2 Pitchers */}
                                    {team2Pitchers.length > 0 && (
                                        <div>
                                            <div className="text-xs font-black uppercase tracking-widest text-primary mb-3 border-b border-primary/20 pb-2">
                                                {team2?.name} (Local)
                                            </div>
                                            <div className="space-y-3">
                                                {team2Pitchers.map(playerId => {
                                                    const player = allPlayersFromTeams.find(p => p.id === playerId);
                                                    return (
                                                        <div key={playerId} className="flex flex-col gap-3 p-4 bg-background border border-primary/10 rounded-xl shadow-sm hover:border-primary/30 transition-all">
                                                            <div className="flex items-center justify-between">
                                                                <div className="font-mono font-black text-sm uppercase tracking-tight">
                                                                    #{player?.number} {player?.name}
                                                                </div>
                                                                {isAdmin && (
                                                                    <Button variant="ghost" size="sm" onClick={() => removePitcher(playerId)} className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/5">
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                                                                <StatInput label="IP" value={getPitchingStat(playerId, "inningsPitched")} onChange={(v: string) => handlePitchingChange(playerId, "inningsPitched", v)} type="text" />
                                                                <StatInput label="H" value={getPitchingStat(playerId, "hits")} onChange={(v: string) => handlePitchingChange(playerId, "hits", v)} />
                                                                <StatInput label="R" value={getPitchingStat(playerId, "runs")} onChange={(v: string) => handlePitchingChange(playerId, "runs", v)} />
                                                                <StatInput label="ER" value={getPitchingStat(playerId, "earnedRuns")} onChange={(v: string) => handlePitchingChange(playerId, "earnedRuns", v)} />
                                                                <StatInput label="BB" value={getPitchingStat(playerId, "walks")} onChange={(v: string) => handlePitchingChange(playerId, "walks", v)} />
                                                                <StatInput label="SO" value={getPitchingStat(playerId, "strikeOuts")} onChange={(v: string) => handlePitchingChange(playerId, "strikeOuts", v)} />
                                                                <StatInput label="W" value={getPitchingStat(playerId, "wins")} onChange={(v: string) => handlePitchingChange(playerId, "wins", v)} />
                                                                <StatInput label="L" value={getPitchingStat(playerId, "losses")} onChange={(v: string) => handlePitchingChange(playerId, "losses", v)} />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    </TabsContent>
                </Tabs>

                <DialogFooter className="py-3 px-4 bg-muted/30 border-t border-primary/10">
                    <Button variant="outline" className="w-full font-black uppercase tracking-widest text-[11px] h-10" asChild>
                        <DialogTrigger>Cerrar Panel</DialogTrigger>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
