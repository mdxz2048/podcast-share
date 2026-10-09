import React from "../../web/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../web/node_modules/react-dom/server.js";
import { describe, expect, it } from "vitest";
import { ConnectorAuthDialog, currentQrChallenge } from "../../web/components/connector-auth-dialog.js";

const qr = {
  created_at: "2030-01-01", event_type: "auth_challenge", message: "请使用微信扫码",
  payload_json: { challenge_id: "qr-1", image_data_url: "data:image/png;base64,AAAA", expires_at: "2030-01-01T00:00:00Z" }
};
const result = { created_at: "2030-01-02", event_type: "auth_result", message: "登录成功", payload_json: { challenge_id: "qr-1", status: "authenticated" } };

describe("administrator QR dialog", () => {
  it("shows a QR dialog for a running job and removes it after verified authentication", () => {
    expect(currentQrChallenge([qr], "running")?.id).toBe("qr-1");
    expect(currentQrChallenge([qr, result], "running")).toBeNull();
    expect(currentQrChallenge([qr], "failed")).toBeNull();
    expect(currentQrChallenge([qr], "cancelled")).toBeNull();
  });

  it("supports QR refreshes and does not dismiss a new stage for an older result", () => {
    const second = { ...qr, payload_json: { ...qr.payload_json, challenge_id: "qr-2", image_data_url: "data:image/png;base64,BBBB" } };
    expect(currentQrChallenge([qr, second, result], "running")?.id).toBe("qr-2");
    expect(currentQrChallenge([qr, { ...qr, payload_json: { ...qr.payload_json, image_data_url: "data:image/png;base64,CCCC" } }], "running")?.image).toContain("CCCC");
  });

  it("renders the administrator popup and never renders a remote QR URL", () => {
    const markup = renderToStaticMarkup(React.createElement(ConnectorAuthDialog, { jobId: "job", status: "running", events: [qr] }));
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("data:image/png;base64,AAAA");
    expect(markup).toContain("扫码后无需点击确认");
    expect(currentQrChallenge([{ ...qr, payload_json: { image_data_url: "https://example.com/qr.png" } }], "running")).toBeNull();
  });
});
