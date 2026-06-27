export default function HomePage() {
  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight">私有播客节目管理与订阅</h1>
        <p className="max-w-3xl text-base leading-7 text-muted">
          Podcast Hub 用于管理员在授权前提下下载与整理播客内容，并为注册用户生成可在播客客户端订阅的私有 RSS。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="card">
          <h2 className="mb-2 text-lg font-medium">注册与登录</h2>
          <p className="text-sm text-muted">用户通过邮箱注册，验证后可创建和管理自己的私有 RSS。</p>
        </article>
        <article className="card">
          <h2 className="mb-2 text-lg font-medium">节目管理</h2>
          <p className="text-sm text-muted">管理员控制节目开放状态，确保内容只对合规用户可见。</p>
        </article>
        <article className="card">
          <h2 className="mb-2 text-lg font-medium">私有订阅</h2>
          <p className="text-sm text-muted">每个用户可自定义节目集合并生成专属 RSS 订阅链接。</p>
        </article>
      </div>
    </section>
  );
}
