import { EventTable } from './Events.jsx';
import { Table } from './ui.jsx';

export function OverviewPage({ overview }) {
  const activeOrganizers = (overview?.organizers || []).filter(organizer =>
    organizer.enabled && organizer.access_level === 'organizer');
  return <>
    <section className="panel">
      <h1>System overview</h1>
      <p>Shared records from the attendance server.</p>
      <div className="grid">
        <div className="panel"><div className="metric">{overview?.students?.length ?? 0}</div><div className="muted">Students</div></div>
        <div className="panel"><div className="metric">{activeOrganizers.length}</div><div className="muted">Active organizers</div></div>
        <div className="panel"><div className="metric">{overview?.events?.length ?? 0}</div><div className="muted">Events</div></div>
        <div className="panel"><div className="metric">{overview?.attendanceCount ?? 0}</div><div className="muted">Synced check-ins</div></div>
      </div>
    </section>
    <section className="panel">
      <h2>Recent events</h2>
      <EventTable events={(overview?.events || []).slice(0, 6)} />
    </section>
    <section className="panel">
      <h2>Administrator activity</h2>
      <Table headings={['When', 'Who', 'Action', 'Details']} empty="No audit activity yet.">
        {(overview?.audit || []).map(item => <tr key={item.id}>
          <td>{item.created_at}</td>
          <td>{item.actor_name} ({item.actor_id})</td>
          <td>{String(item.action || '').replaceAll('_', ' ')}</td>
          <td>{JSON.stringify(item.details)}</td>
        </tr>)}
      </Table>
    </section>
  </>;
}
