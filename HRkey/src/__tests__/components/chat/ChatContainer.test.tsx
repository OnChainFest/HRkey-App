import { fireEvent, render, screen } from "@testing-library/react";
import ChatContainer from "@/components/chat/ChatContainer";
import { ApiClientError, apiPost } from "@/lib/apiClient";

jest.mock("@/lib/apiClient", () => ({
  ApiClientError: class MockApiClientError extends Error {
    status: number;
    details?: unknown;

    constructor(message: string, status: number, details?: unknown) {
      super(message);
      this.name = "ApiClientError";
      this.status = status;
      this.details = details;
    }
  },
  apiPost: jest.fn(),
}));

const mockedApiPost = apiPost as jest.MockedFunction<typeof apiPost>;

const startState = {
  phase: "context",
  step: 0,
  messages: [{ role: "assistant", content: "To start, what was your working relationship with the candidate?" }],
  meta: { promptVersion: "v1" },
};

function messageState(step: number) {
  return {
    ...startState,
    step,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("ChatContainer", () => {
  beforeEach(() => {
    mockedApiPost.mockReset();
    window.localStorage.clear();
    Element.prototype.scrollIntoView = jest.fn();
  });

  it("renders the initial Lou prompt after starting a conversation", async () => {
    mockedApiPost.mockResolvedValueOnce({ ok: true, conversationState: startState });

    render(<ChatContainer />);

    expect(await screen.findByText("To start, what was your working relationship with the candidate?")).toBeInTheDocument();
    expect(mockedApiPost).toHaveBeenCalledWith("/api/lou-agent/start", {});
  });

  it("restores a persisted conversation without starting a new one", async () => {
    window.localStorage.setItem(
      "lou_conversation",
      JSON.stringify({
        version: 1,
        conversationState: startState,
        messages: [{ id: "lou-1", role: "lou", content: "Persisted prompt" }],
        completed: false,
      })
    );

    render(<ChatContainer />);

    expect(await screen.findByText("Persisted prompt")).toBeInTheDocument();
    expect(mockedApiPost).not.toHaveBeenCalled();
  });

  it("sends a user message and renders Lou's reply on the happy path", async () => {
    mockedApiPost
      .mockResolvedValueOnce({ ok: true, conversationState: startState })
      .mockResolvedValueOnce({
        ok: true,
        response: "Thanks. What role or scope were they responsible for?",
        conversationState: messageState(1),
        meta: { completed: false },
      });

    render(<ChatContainer />);

    await screen.findByText("To start, what was your working relationship with the candidate?");

    fireEvent.change(screen.getByLabelText("Your response"), {
      target: { value: "I managed her directly for two years." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("I managed her directly for two years.")).toBeInTheDocument();
    expect(await screen.findByText("Thanks. What role or scope were they responsible for?")).toBeInTheDocument();
    expect(mockedApiPost).toHaveBeenLastCalledWith("/api/lou-agent/message", {
      conversationState: startState,
      message: "I managed her directly for two years.",
    });
  });

  it("shows the loading state and disables input while awaiting Lou", async () => {
    const pendingStart = deferred<{ ok: true; conversationState: typeof startState }>();
    const pendingMessage = deferred<{
      ok: true;
      response: string;
      conversationState: ReturnType<typeof messageState>;
      meta: { completed: false };
    }>();

    mockedApiPost.mockReturnValueOnce(pendingStart.promise as never);

    render(<ChatContainer />);

    pendingStart.resolve({ ok: true, conversationState: startState });
    await screen.findByText("To start, what was your working relationship with the candidate?");

    mockedApiPost.mockReturnValueOnce(pendingMessage.promise as never);

    const input = screen.getByLabelText("Your response") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "We worked closely." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText("Lou is thinking")).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

    pendingMessage.resolve({
      ok: true,
      response: "What role or scope were they responsible for while you worked with them?",
      conversationState: messageState(1),
      meta: { completed: false },
    });

    expect(await screen.findByText("What role or scope were they responsible for while you worked with them?")).toBeInTheDocument();
  });

  it("renders an inline retry state when sending fails", async () => {
    mockedApiPost
      .mockResolvedValueOnce({ ok: true, conversationState: startState })
      .mockRejectedValueOnce(new ApiClientError("Temporary failure", 500));

    render(<ChatContainer />);

    await screen.findByText("To start, what was your working relationship with the candidate?");

    fireEvent.change(screen.getByLabelText("Your response"), {
      target: { value: "I supervised him." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Temporary failure")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry sending:/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Your response")).toHaveValue("I supervised him.");
  });

  it("disables the input and shows completion actions when the conversation is finished", async () => {
    mockedApiPost
      .mockResolvedValueOnce({ ok: true, conversationState: startState })
      .mockResolvedValueOnce({
        ok: true,
        response: "Thank you. That gives us a structured, evidence-based reference.",
        conversationState: messageState(2),
        meta: { completed: true },
      });

    render(<ChatContainer />);

    await screen.findByText("To start, what was your working relationship with the candidate?");

    fireEvent.change(screen.getByLabelText("Your response"), {
      target: { value: "Final detail." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/This reference conversation is complete/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start new conversation" })).toBeInTheDocument();
    expect(screen.getByLabelText("Your response")).toBeDisabled();
  });

  it("resets the session, clears persistence, and starts a fresh conversation", async () => {
    mockedApiPost
      .mockResolvedValueOnce({ ok: true, conversationState: startState })
      .mockResolvedValueOnce({
        ok: true,
        conversationState: {
          ...startState,
          messages: [{ role: "assistant", content: "Fresh prompt" }],
        },
      });

    render(<ChatContainer />);

    await screen.findByText("To start, what was your working relationship with the candidate?");

    fireEvent.click(screen.getByRole("button", { name: "Reset conversation" }));

    expect(await screen.findByText("Fresh prompt")).toBeInTheDocument();
    expect(window.localStorage.getItem("lou_conversation")).toContain("Fresh prompt");
    expect(mockedApiPost).toHaveBeenNthCalledWith(2, "/api/lou-agent/start", {});
  });

  it("does not duplicate hydrated messages after restoring local state", async () => {
    window.localStorage.setItem(
      "lou_conversation",
      JSON.stringify({
        version: 1,
        conversationState: startState,
        messages: [{ id: "lou-1", role: "lou", content: "Hydrated once" }],
        completed: false,
      })
    );

    render(<ChatContainer />);

    const hydratedMessages = await screen.findAllByText("Hydrated once");
    expect(hydratedMessages).toHaveLength(1);
    expect(mockedApiPost).not.toHaveBeenCalled();
  });
});
