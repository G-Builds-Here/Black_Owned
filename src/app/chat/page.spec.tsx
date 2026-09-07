/**
 * /chat page tests (LOC-0042 C2)
 *
 * AC1: conversation list with 50-char preview + unread badge + empty state
 * AC2: optimistic send (sending -> sent), offline queue flushed on reconnect
 * AC3: deep link ?conversation=<id> resumes without duplicates
 * Live: NATS chat.message.<id> appends to the open thread
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ChatPage from "./page";

const mockRouter = { push: jest.fn(), replace: jest.fn() };
let searchParams: URLSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => searchParams,
}));

const mockGetSession = jest.fn();
const mockClearSession = jest.fn();
jest.mock("@/lib/auth/client-session", () => ({
  getSession: () => mockGetSession(),
  authHeaders: () => ({ Authorization: "Bearer access" }),
  clearSession: () => mockClearSession(),
}));

const mockConnect = jest.fn();
const mockIsOnline = jest.fn();
const connectionListeners: Array<(online: boolean) => void> = [];
const mockOnConnectionChange = jest.fn((listener: (online: boolean) => void) => {
  connectionListeners.push(listener);
  return () => {
    const i = connectionListeners.indexOf(listener);
    if (i >= 0) connectionListeners.splice(i, 1);
  };
});
const liveSubs: Array<{ subject: string; cb: (payload: unknown) => void }> = [];
const mockSubscribeChat = jest.fn((subject: string, cb: (payload: unknown) => void) => {
  liveSubs.push({ subject, cb });
  return () => {
    const i = liveSubs.findIndex((s) => s.subject === subject && s.cb === cb);
    if (i >= 0) liveSubs.splice(i, 1);
  };
});
jest.mock("@/lib/chat/nats-client", () => ({
  connectChatNats: () => mockConnect(),
  isOnline: () => mockIsOnline(),
  onConnectionChange: (l: (o: boolean) => void) => mockOnConnectionChange(l),
  subscribeChat: (s: string, cb: (p: unknown) => void) => mockSubscribeChat(s, cb),
}));

function res(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

const CONV_A = {
  id: "11111111-1111-4111-8111-111111111111",
  businessId: "22222222-2222-4222-8222-222222222222",
  businessName: "Cozy Corner Cafe",
  category: "Food & Dining",
  lastMessage:
    "This is a very long last message that should definitely exceed fifty characters for truncation",
  lastMessageAt: "2026-08-22T09:00:00.000Z",
  unreadCount: 2,
  createdAt: "2026-08-01T00:00:00.000Z",
};
const CONV_B = {
  id: "55555555-5555-4555-8555-555555555555",
  businessId: "66666666-6666-4666-8666-666666666666",
  businessName: "Riverside Bakery",
  category: "Food & Dining",
  lastMessage: "Hi",
  lastMessageAt: "2026-08-21T09:00:00.000Z",
  unreadCount: 0,
  createdAt: "2026-08-02T00:00:00.000Z",
};

const NEWEST = {
  id: "88888888-8888-4888-8888-888888888888",
  senderUserId: "owner-9",
  senderName: "Owner",
  body: "Yes, until 9pm",
  isRead: true,
  createdAt: "2026-08-22T12:00:00.000Z",
};
const OLDEST = {
  id: "77777777-7777-4777-8777-777777777777",
  senderUserId: "u-1",
  senderName: "User",
  body: "Are you open today?",
  isRead: true,
  createdAt: "2026-08-22T11:00:00.000Z",
};

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>;
function setFetch(handler: FetchHandler) {
  (global.fetch as jest.Mock).mockImplementation(handler);
}

function defaultHandler(overrides: Partial<Record<"list" | "history" | "read", Response>> = {}) {
  return async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET" && url === "/api/chat/conversations") {
      return overrides.list ?? res(200, { success: true, data: { conversations: [CONV_A, CONV_B] } });
    }
    if (method === "GET" && String(url).endsWith("/messages")) {
      return overrides.history ?? res(200, { success: true, data: { messages: [NEWEST, OLDEST], hasMore: false } });
    }
    if (method === "POST" && String(url).endsWith("/read")) {
      return overrides.read ?? res(200, { success: true, data: { read: 2 } });
    }
    return res(404, { success: false, error: "Not found" });
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  searchParams = new URLSearchParams();
  connectionListeners.length = 0;
  liveSubs.length = 0;
  mockGetSession.mockReturnValue({
    accessToken: "access",
    user: { id: "u-1", email: "user@example.com", name: "User" },
  });
  mockConnect.mockResolvedValue(true);
  mockIsOnline.mockReturnValue(true);
  global.fetch = jest.fn() as unknown as typeof fetch;
});

describe("/chat page", () => {
  it("redirects to /login when there is no session", async () => {
    mockGetSession.mockReturnValue(null);
    render(<ChatPage />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/login"));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows the empty state with a directory link when there are no conversations", async () => {
    setFetch(defaultHandler({ list: res(200, { success: true, data: { conversations: [] } }) }));
    render(<ChatPage />);
    expect(
      await screen.findByText("No conversations yet — browse the directory")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse Directory" })).toHaveAttribute(
      "href",
      "/directory"
    );
  });

  it("lists conversations with a 50-char preview and unread badges", async () => {
    setFetch(defaultHandler());
    render(<ChatPage />);
    expect(await screen.findByText("Cozy Corner Cafe")).toBeInTheDocument();
    expect(screen.getByText("Riverside Bakery")).toBeInTheDocument();

    const expectedPreview = `${CONV_A.lastMessage.slice(0, 50).trimEnd()}…`;
    expect(screen.getByText(expectedPreview)).toBeInTheDocument();
    expect(screen.getByText("Hi")).toBeInTheDocument();

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("loads the deep-linked thread oldest-first and marks it read", async () => {
    searchParams = new URLSearchParams(`conversation=${CONV_A.id}`);
    const calls: Array<{ url: string; method: string }> = [];
    setFetch(async (url, init) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      return defaultHandler()(url, init);
    });
    const { container } = render(<ChatPage />);

    await screen.findByText("Are you open today?");
    const ids = Array.from(container.querySelectorAll("[data-message-id]")).map(
      (el) => el.getAttribute("data-message-id")
    );
    expect(ids).toEqual([OLDEST.id, NEWEST.id]);

    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.url.endsWith(`/${CONV_A.id}/read`))).toBe(
        true
      )
    );
  });

  it("appends an optimistic message as Sending… then Sent after the API confirms", async () => {
    searchParams = new URLSearchParams(`conversation=${CONV_A.id}`);
    let resolveSend: (r: Response) => void;
    const sendGate = new Promise<Response>((r) => (resolveSend = r));
    setFetch(async (url, init) => {
      if (init?.method === "POST" && String(url).endsWith("/messages")) {
        return sendGate;
      }
      return defaultHandler({ history: res(200, { success: true, data: { messages: [], hasMore: false } }) })(url, init);
    });
    render(<ChatPage />);
    await screen.findByText("No messages yet. Say hello!");

    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hello there" } });
    fireEvent.click(screen.getByRole("button", { name: "Send", exact: true }));

    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.getByText("Sending…")).toBeInTheDocument();

    resolveSend!(
      res(201, {
        success: true,
        data: {
          message: {
            id: "33333333-3333-4333-8333-333333333333",
            senderUserId: "u-1",
            body: "Hello there",
            isRead: true,
            createdAt: "2026-08-22T10:00:00.000Z",
          },
          delivered: true,
        },
      })
    );
    await waitFor(() => expect(screen.getByText("Sent")).toBeInTheDocument());

    const sendCall = (global.fetch as jest.Mock).mock.calls.find(
      (c) => c[0].endsWith("/messages") && c[1]?.method === "POST"
    );
    expect(sendCall![1].body).toBe(JSON.stringify({ body: "Hello there" }));
    expect(sendCall![1].headers).toMatchObject({ Authorization: "Bearer access" });
  });

  it("queues a failed send and flushes it when the socket reconnects", async () => {
    mockConnect.mockResolvedValue(false);
    mockIsOnline.mockReturnValue(false);
    searchParams = new URLSearchParams(`conversation=${CONV_A.id}`);

    let sendFails = true;
    setFetch(async (url, init) => {
      if (init?.method === "POST" && String(url).endsWith("/messages")) {
        if (sendFails) throw new Error("network down");
        return res(201, {
          success: true,
          data: {
            message: {
              id: "44444444-4444-4444-8444-444444444444",
              senderUserId: "u-1",
              body: "Still there?",
              isRead: true,
              createdAt: "2026-08-22T10:05:00.000Z",
            },
            delivered: true,
          },
        });
      }
      return defaultHandler({
        history: res(200, { success: true, data: { messages: [], hasMore: false } }),
      })(url, init);
    });
    render(<ChatPage />);
    expect(await screen.findByText("Live updates off — messages will sync when the connection is back.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Still there?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send", exact: true }));
    await waitFor(() =>
      expect(screen.getByText("Queued — will send when back online")).toBeInTheDocument()
    );

    sendFails = false;
    connectionListeners.forEach((listener) => listener(true));
    await waitFor(() => expect(screen.getByText("Sent")).toBeInTheDocument());
    expect(screen.queryByText("Queued — will send when back online")).not.toBeInTheDocument();
  });

  it("appends a live NATS message to the open thread and refreshes the list preview", async () => {
    searchParams = new URLSearchParams(`conversation=${CONV_A.id}`);
    setFetch(
      defaultHandler({
        history: res(200, { success: true, data: { messages: [], hasMore: false } }),
      })
    );
    render(<ChatPage />);
    await screen.findByText("No messages yet. Say hello!");

    const threadSub = liveSubs.find((s) => s.subject === `chat.message.${CONV_A.id}`);
    expect(threadSub).toBeDefined();
    threadSub!.cb({
      conversationId: CONV_A.id,
      businessId: CONV_A.businessId,
      businessName: CONV_A.businessName,
      messageId: "99999999-9999-4999-8999-999999999999",
      senderUserId: "owner-9",
      senderName: "Owner",
      body: "Yes, until 9pm",
      createdAt: "2026-08-22T12:30:00.000Z",
    });

    const matches = await screen.findAllByText("Yes, until 9pm");
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Owner")).toBeInTheDocument();
    // the open thread is read as it happens — the badge clears
    await waitFor(() => expect(screen.queryByText("2")).not.toBeInTheDocument());
  });
});
