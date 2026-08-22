/**
 * NotificationBanner tests (LOC-0042 C3)
 *
 * Latest notification wins; 5s auto-dismiss (a new notification resets the
 * timer); a manually dismissed message never re-shows; clicking deep-links
 * into /chat?conversation=<id>; signed-out users get nothing.
 */

import { render, screen, fireEvent, act } from "@testing-library/react";
import { NotificationBanner } from "./NotificationBanner";

const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

const mockGetSession = jest.fn();
jest.mock("@/lib/auth/client-session", () => ({
  getSession: () => mockGetSession(),
}));

const mockConnect = jest.fn();
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
  subscribeChat: (s: string, cb: (p: unknown) => void) => mockSubscribeChat(s, cb),
}));

const NOTIFICATION_SUBJECT = "chat.notification.u-1";

function emit(payload: unknown) {
  const sub = liveSubs.find((s) => s.subject === NOTIFICATION_SUBJECT);
  act(() => {
    sub?.cb(payload);
  });
}

function notification(id: string, overrides: Record<string, unknown> = {}) {
  return {
    conversationId: "11111111-1111-4111-8111-111111111111",
    businessId: "22222222-2222-4222-8222-222222222222",
    businessName: "Soul Food Kitchen",
    messageId: id,
    senderUserId: "owner-9",
    senderName: "Owner",
    preview: "Yes, until 9pm",
    createdAt: "2026-08-22T12:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  liveSubs.length = 0;
  mockGetSession.mockReturnValue({
    accessToken: "access",
    refreshToken: "refresh",
    user: { id: "u-1", email: "user@example.com", name: "User" },
  });
  mockConnect.mockResolvedValue(true);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("NotificationBanner", () => {
  it("renders nothing and does not subscribe when signed out", () => {
    mockGetSession.mockReturnValue(null);
    const { container } = render(<NotificationBanner />);
    expect(container).toBeEmptyDOMElement();
    expect(mockSubscribeChat).not.toHaveBeenCalled();
  });

  it("shows the latest notification and drops older ones", () => {
    render(<NotificationBanner />);
    emit(notification("msg-1", { preview: "First preview" }));
    expect(screen.getByText("First preview")).toBeInTheDocument();
    emit(notification("msg-2", { preview: "Second preview" }));
    expect(screen.getByText("Second preview")).toBeInTheDocument();
    expect(screen.queryByText("First preview")).not.toBeInTheDocument();
  });

  it("auto-dismisses after 5s and a new notification resets the timer", () => {
    render(<NotificationBanner />);
    emit(notification("msg-1"));
    expect(screen.getByText("Click to open the conversation")).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByText("Click to open the conversation")).toBeInTheDocument();
    emit(notification("msg-2"));
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByText("Click to open the conversation")).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.queryByText("Click to open the conversation")).not.toBeInTheDocument();
  });

  it("never re-shows a manually dismissed message", () => {
    render(<NotificationBanner />);
    emit(notification("msg-1"));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByText("Click to open the conversation")).not.toBeInTheDocument();
    emit(notification("msg-1"));
    expect(screen.queryByText("Click to open the conversation")).not.toBeInTheDocument();
    emit(notification("msg-2"));
    expect(screen.getByText("Click to open the conversation")).toBeInTheDocument();
  });

  it("deep-links into the conversation when clicked", () => {
    render(<NotificationBanner />);
    emit(notification("msg-1", { conversationId: "33333333-3333-4333-8333-333333333333" }));
    fireEvent.click(screen.getByRole("button", { name: /Soul Food Kitchen/ }));
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/chat?conversation=33333333-3333-4333-8333-333333333333"
    );
  });

  it("ignores malformed payloads", () => {
    render(<NotificationBanner />);
    emit({ messageId: "msg-1" });
    emit({ conversationId: "11111111-1111-4111-8111-111111111111" });
    expect(screen.queryByText("Click to open the conversation")).not.toBeInTheDocument();
  });
});
