export default function SimpleTable({ columns, rows }) {
  return (
    <div className='card overflow-auto'>
      <table className='w-full text-sm'>
        <thead>
          <tr className='border-b border-slate-200 text-left'>
            {columns.map(col => (
              <th key={col.key} className='py-2 pr-4 font-medium text-slate-600'>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className='border-b border-slate-100'>
              {columns.map(col => (
                <td key={col.key} className='py-2 pr-4 align-top'>
                  {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
