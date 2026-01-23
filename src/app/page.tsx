import { getTeams, getGames, getAllStats } from './actions'
import TournamentManager from '@/components/TournamentManager'

export const dynamic = 'force-dynamic';

export default async function Home() {
  const teams = await getTeams()
  const games = await getGames()
  const { battingStats, pitchingStats } = await getAllStats()

  return (
    <TournamentManager
      initialTeams={teams}
      initialGames={games}
      initialBattingStats={battingStats}
      initialPitchingStats={pitchingStats}
    />
  )
}
