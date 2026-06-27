export default function RssEditPage({ params }: { params: { id: string } }) {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">RSS 编辑</h1>
      <p className="text-sm text-muted">RSS ID: {params.id}</p>
    </section>
  );
}
