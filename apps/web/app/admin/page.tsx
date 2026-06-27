export default function AdminHomePage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">管理员后台</h1>
      <p className="text-sm text-muted">已接入 Source 运行编排、用户类别与权限收敛管理能力。</p>
      <div className="grid gap-3 md:grid-cols-2">
        <a className="card text-sm text-muted" href="/admin/programs">
          节目可见性管理
        </a>
        <a className="card text-sm text-muted" href="/admin/users">
          用户管理
        </a>
        <a className="card text-sm text-muted" href="/admin/audience-groups">
          用户类别管理
        </a>
        <a className="card text-sm text-muted" href="/admin/connectors">
          Connector 管理
        </a>
        <a className="card text-sm text-muted" href="/admin/connectors/upload">
          上传 Connector ZIP
        </a>
        <a className="card text-sm text-muted" href="/admin/connectors/packaging-guide">
          Connector 打包规范模板
        </a>
        <a className="card text-sm text-muted" href="/admin/sources">
          Source 管理
        </a>
        <a className="card text-sm text-muted" href="/admin/jobs">
          任务列表
        </a>
      </div>
    </section>
  );
}
