import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { CampaignTypeBadge } from "./campaign-type-badge";

describe("CampaignTypeBadge", () => {
  it("renders evergreen label", () => {
    const html = renderToString(
      <CampaignTypeBadge type="evergreen" source="auto" />
    );
    expect(html).toMatch(/evergreen/i);
  });

  it("renders sale label", () => {
    const html = renderToString(
      <CampaignTypeBadge type="sale" source="manual" />
    );
    expect(html).toMatch(/sale/i);
  });

  it("renders seasonal (Czech) label", () => {
    const html = renderToString(
      <CampaignTypeBadge type="seasonal" source="auto" />
    );
    expect(html).toMatch(/sezón/i);
  });

  it("renders unknown with neklasifikováno label", () => {
    const html = renderToString(
      <CampaignTypeBadge type="unknown" source="auto" />
    );
    expect(html).toMatch(/neklasifikov/i);
  });

  it("renders a clickable button when onClick is provided", () => {
    const html = renderToString(
      <CampaignTypeBadge
        type="evergreen"
        source="auto"
        onClick={() => undefined}
      />
    );
    // Button should not be disabled when clickable
    expect(html).not.toMatch(/disabled/);
    expect(html).toMatch(/cursor-pointer/);
  });

  it("renders a disabled button when onClick is not provided", () => {
    const html = renderToString(
      <CampaignTypeBadge type="evergreen" source="auto" />
    );
    expect(html).toMatch(/disabled/);
  });

  it("shows manual tooltip when source is manual", () => {
    const html = renderToString(
      <CampaignTypeBadge type="evergreen" source="manual" />
    );
    expect(html).toMatch(/manuálně/i);
  });

  it("shows auto tooltip when source is auto", () => {
    const html = renderToString(
      <CampaignTypeBadge type="evergreen" source="auto" />
    );
    expect(html).toMatch(/auto-klasifikov/i);
  });
});
