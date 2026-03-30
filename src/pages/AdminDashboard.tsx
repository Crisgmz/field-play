import { mockBookings, mockBlocks, mockClubs } from '@/data/mockData';
import { Calendar, Users, DollarSign, Shield } from 'lucide-react';

export default function AdminDashboard() {
  const totalBookings = mockBookings.length;
  const totalBlocks = mockBlocks.length;

  const stats = [
    { label: 'Total Bookings', value: totalBookings, icon: Calendar, color: 'text-primary' },
    { label: 'Active Blocks', value: totalBlocks, icon: Shield, color: 'text-warning' },
    { label: 'Clubs', value: mockClubs.length, icon: Users, color: 'text-field-7' },
    { label: 'Revenue', value: `$${totalBookings * 120}`, icon: DollarSign, color: 'text-primary' },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">Admin Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
            <p className="mt-2 font-heading text-2xl font-bold text-card-foreground">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Recent bookings */}
      <h2 className="mb-3 mt-8 font-heading text-lg font-bold text-foreground">Recent Bookings</h2>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {mockBookings.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-card-foreground">{b.date}</td>
                  <td className="px-4 py-3 text-muted-foreground">{b.start_time} – {b.end_time}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      b.field_type === 'F11' ? 'field-badge-11' : b.field_type === 'F7' ? 'field-badge-7' : 'field-badge-5'
                    }`}>{b.field_type}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">{b.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Blocks */}
      <h2 className="mb-3 mt-8 font-heading text-lg font-bold text-foreground">Active Blocks</h2>
      <div className="space-y-3">
        {mockBlocks.map((block) => (
          <div key={block.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-heading text-sm font-bold text-card-foreground">{block.reason}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{block.date} · {block.start_time} – {block.end_time}</p>
              </div>
              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">{block.type}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
