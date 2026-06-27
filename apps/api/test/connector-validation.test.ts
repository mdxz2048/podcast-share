import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { validateConnectorZip } from "../src/utils/connector-validation.js";

function buildValidZipBuffer() {
  const zip = new AdmZip();
  zip.addFile(
    "manifest.yaml",
    Buffer.from(`schema_version: 1
name: fixture-program-downloader
display_name: Fixture 节目下载器
version: 1.0.1
description: test
runtime:
  language: python
  entrypoint: src/connector.py
run_modes:
  manual: true
  scheduled: true
authentication:
  modes:
    - none
  unattended_supported: true
inputs:
  - key: source_url
    label: 来源地址
    type: text
    required: true
output:
  protocol: podcast-hub-jsonl-v1
  media_root: /work/output/media
`)
  );
  zip.addFile("src/connector.py", Buffer.from("print('ok')\n"));
  zip.addFile("requirements.lock", Buffer.from("# lock\n"));
  zip.addFile("README.md", Buffer.from("readme\n"));
  return zip.toBuffer();
}

describe("connector zip validation", () => {
  it("accepts a valid python connector package", () => {
    const result = validateConnectorZip(buildValidZipBuffer());
    expect(result.manifest.name).toBe("fixture-program-downloader");
    expect(result.manifest.runtime.language).toBe("python");
    expect(result.checksum.length).toBe(64);
  });

  it("rejects blocked files", () => {
    const zip = new AdmZip();
    zip.addFile("manifest.yaml", Buffer.from("schema_version: 1\nname: n\ndisplay_name: d\nversion: 1\nruntime:\n  language: python\n  entrypoint: src/connector.py\nrun_modes:\n  manual: true\n  scheduled: true\nauthentication:\n  modes:\n    - none\n  unattended_supported: true\ninputs: []\noutput:\n  protocol: podcast-hub-jsonl-v1\n  media_root: /work/output/media\n"));
    zip.addFile("src/connector.py", Buffer.from("print('ok')\n"));
    zip.addFile("requirements.lock", Buffer.from("# lock\n"));
    zip.addFile("README.md", Buffer.from("readme\n"));
    zip.addFile(".env", Buffer.from("SECRET=1\n"));

    expect(() => validateConnectorZip(zip.toBuffer())).toThrow(/blocked file name/i);
  });

  it("rejects non-python manifest", () => {
    const zip = new AdmZip();
    zip.addFile(
      "manifest.yaml",
      Buffer.from(`schema_version: 1
name: demo
display_name: Demo
version: 1.0.0
runtime:
  language: node
  entrypoint: src/index.js
run_modes:
  manual: true
  scheduled: false
authentication:
  modes:
    - none
  unattended_supported: true
inputs: []
output:
  protocol: podcast-hub-jsonl-v1
  media_root: /work/output/media
`)
    );
    zip.addFile("src/connector.py", Buffer.from("print('ok')\n"));
    zip.addFile("requirements.lock", Buffer.from("# lock\n"));
    zip.addFile("README.md", Buffer.from("readme\n"));

    expect(() => validateConnectorZip(zip.toBuffer())).toThrow(/manifest schema invalid|only supports python/i);
  });
});
