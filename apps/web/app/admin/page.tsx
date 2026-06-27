export default function AdminHomePage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">管理员后台</h1>
      <p className="text-sm text-muted">已接入 Connector 上传审核与 Source 配置基础流程。</p>
      <div className="grid gap-3 md:grid-cols-2">
        <a className="card text-sm text-muted" href="/admin/connectors">
          Connector 管理
        </a>
        <a className="card text-sm text-muted" href="/admin/sources">
          Source 管理
        </a>
      </div>
    </section>
  );
}
