export default function ConnectorPackagingGuidePage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Connector 打包要求模板</h1>
      <p className="text-sm text-muted">
        用于给真实脚本打包时对照检查，避免上传后被校验器拦截。
      </p>

      <article className="card space-y-3">
        <h2 className="text-base font-medium">目录结构模板</h2>
        <pre className="overflow-x-auto rounded-md bg-slate-950/95 p-3 text-xs text-slate-100">
{`connector-name.zip
├─ manifest.yaml
├─ requirements.lock
├─ README.md
├─ src/
│  └─ connector.py
├─ scripts/
│  └─ your_real_script.py
└─ runtime_data/
   └─ auth_payload.txt`}
        </pre>
      </article>

      <article className="card space-y-3">
        <h2 className="text-base font-medium">manifest.yaml 最小模板</h2>
        <pre className="overflow-x-auto rounded-md bg-slate-950/95 p-3 text-xs text-slate-100">
{`schema_version: 1
name: your-connector-name
display_name: 你的 Connector 名称
version: 1.0.0
runtime:
  language: python
  entrypoint: src/connector.py
run_modes:
  manual: true
  scheduled: true
authentication:
  modes:
    - bundled_session
  unattended_supported: true
inputs:
  - key: source_name
    label: 来源名称
    type: text
    required: true
    default: your-source
  - key: limit
    label: 单次数量
    type: number
    required: false
    default: 10
secrets: []`}
        </pre>
      </article>

      <article className="card space-y-3">
        <h2 className="text-base font-medium">README.md 建议模板</h2>
        <pre className="overflow-x-auto rounded-md bg-slate-950/95 p-3 text-xs text-slate-100">
{`# Connector Name

## What it does
- Describe imported program/episode/media behavior.

## Input Config
- source_name: string
- limit: number

## Auth Strategy
- Store auth payload as text (base64/plain text) in runtime_data.
- Reconstruct runtime session/cookies only at execution time.

## Runtime Notes
- Python version and required system deps.
- Known constraints and retry behavior.`}
        </pre>
      </article>

      <article className="card space-y-3">
        <h2 className="text-base font-medium">上传前检查清单</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>必须包含 manifest.yaml、requirements.lock、README.md。</li>
          <li>ZIP 内不要出现 session/cookie 等敏感命名文件。</li>
          <li>不要直接打包二进制凭据文件，改为文本化 payload 并在运行时还原。</li>
          <li>入口脚本可执行并稳定输出 JSON 事件流。</li>
          <li>本地先跑一次：program、episode、media_ready 事件结构正确。</li>
        </ul>
      </article>

      <article className="card space-y-3">
        <h2 className="text-base font-medium">注意事项</h2>
        <p className="text-sm text-muted">
          真实环境凭据和下载产物请放在仓库外或忽略目录中，不要提交到 Git。
        </p>
      </article>
    </section>
  );
}
