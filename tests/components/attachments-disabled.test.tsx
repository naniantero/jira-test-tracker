// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "../helpers/intl";
import { CommentForm } from "@/components/story/comment-form";
import { StoryTimeline } from "@/components/story/story-timeline";
import type { TimelineEvent } from "@/lib/stories/queries";

afterEach(cleanup);

function renderForm(attachmentsEnabled: boolean) {
  const onAddFiles = vi.fn();
  renderWithIntl(
    <CommentForm
      mode={null}
      attachmentsEnabled={attachmentsEnabled}
      comment=""
      onCommentChange={() => {}}
      files={[]}
      onAddFiles={onAddFiles}
      onRemoveFile={() => {}}
      error={null}
      pending={false}
      busy={false}
      onSubmit={() => {}}
      onCancel={() => {}}
      textareaRef={{ current: null }}
    />,
  );
  return { onAddFiles };
}

function paste(file: File) {
  const comment = screen.getByRole("textbox", { name: "Comment" });
  fireEvent.paste(comment, { clipboardData: { files: [file] } });
}

const screenshot = new File([new Uint8Array([137, 80, 78, 71])], "shot.png", { type: "image/png" });

describe("CommentForm", () => {
  it("offers the file picker and takes pasted files when attachments are enabled", () => {
    const { onAddFiles } = renderForm(true);
    expect(screen.getByLabelText("Attach files")).toBeInTheDocument();
    paste(screenshot);
    expect(onAddFiles).toHaveBeenCalledWith([screenshot]);
  });

  it("has no file picker and ignores pasted files when attachments are disabled", () => {
    const { onAddFiles } = renderForm(false);
    expect(screen.queryByLabelText("Attach files")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveAttribute("placeholder", "Add a comment…");
    paste(screenshot);
    expect(onAddFiles).not.toHaveBeenCalled();
  });
});

describe("StoryTimeline", () => {
  const events: TimelineEvent[] = [
    {
      id: 1,
      actorName: "Tina Tester",
      fromStatus: "untested",
      toStatus: "failed",
      comment: "Card form crashes",
      createdAt: new Date("2026-11-18T10:00:00Z"),
      attachments: [
        { id: "a1", originalName: "shot.png", mimeType: "image/png", sizeBytes: 4 },
        { id: "a2", originalName: "log.txt", mimeType: "text/plain", sizeBytes: 10 },
      ],
    },
  ];

  it("shows the attachments when enabled", () => {
    renderWithIntl(<StoryTimeline events={events} showAttachments />);
    expect(screen.getByRole("button", { name: "Open shot.png" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /log\.txt/ })).toBeInTheDocument();
  });

  it("hides the attachments but keeps the comment when disabled", () => {
    renderWithIntl(<StoryTimeline events={events} showAttachments={false} />);
    expect(screen.getByText("Card form crashes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open shot.png" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /log\.txt/ })).not.toBeInTheDocument();
  });
});
