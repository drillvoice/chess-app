import type { OtbMove } from '@/lib/otb/types';

interface OtbMoveListProps {
  moves: OtbMove[];
}

export default function OtbMoveList({ moves }: OtbMoveListProps) {
  const rows = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({
      moveNumber: i / 2 + 1,
      white: moves[i]?.san || '',
      black: moves[i + 1]?.san || '',
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <h3 className="mb-2 font-semibold text-gray-800">Moves</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No moves yet.</p>
      ) : (
        <div className="max-h-56 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-gray-500">
                <th className="w-12 py-1">#</th>
                <th className="py-1">White</th>
                <th className="py-1">Black</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.moveNumber} className="border-t border-gray-100">
                  <td className="py-1 text-gray-500">{row.moveNumber}.</td>
                  <td className="py-1 font-medium">{row.white}</td>
                  <td className="py-1 font-medium">{row.black}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
