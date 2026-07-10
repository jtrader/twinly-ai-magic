import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageDisclosureTag } from "../MessageDisclosureTag";

describe("MessageDisclosureTag", () => {
  it("renders the AI marker for an ai_generated message — this is the platform disclosure invariant", () => {
    render(<MessageDisclosureTag senderType="ai" personaName="Nice AI" />);
    const tag = screen.getByTestId("ai-disclosure-tag");
    expect(tag).toBeInTheDocument();
    expect(tag).toHaveTextContent("AI");
    expect(tag).toHaveTextContent("Nice AI");
  });

  it("does NOT render the AI marker for a Real Me (creator) message", () => {
    render(<MessageDisclosureTag senderType="creator" personaName="Real Aurora" />);
    expect(screen.queryByTestId("ai-disclosure-tag")).not.toBeInTheDocument();
    expect(screen.getByTestId("real-me-disclosure-tag")).toBeInTheDocument();
  });

  it("does NOT render the AI marker for a fan's own message", () => {
    render(<MessageDisclosureTag senderType="fan" personaName="Nice AI" />);
    expect(screen.queryByTestId("ai-disclosure-tag")).not.toBeInTheDocument();
  });

  it("renders no tag for a system (away auto-reply) message beyond its own label", () => {
    render(<MessageDisclosureTag senderType="system" personaName="Nice AI" />);
    expect(screen.queryByTestId("ai-disclosure-tag")).not.toBeInTheDocument();
    expect(screen.getByText("Away auto-reply")).toBeInTheDocument();
  });
});
