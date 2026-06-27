export default function ProgramDetailPage({ params }: { params: { id: string } }) {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">节目详情</h1>
      <p className="text-sm text-muted">节目 ID: {params.id}</p>
    </section>
  );
}
