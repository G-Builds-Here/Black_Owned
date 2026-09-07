/**
 * ChatButton tests (LOC-0042 C3)
 *
 * Hidden for signed-out visitors; click creates-or-resumes the conversation
 * and deep-links into /chat?conversation=<id>; 401 clears the stale session
 * and routes to /login; a failed request leaves the button usable.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChatButton } from "./ChatButton";

const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

const mockGetSession = jest.fn();
const mockClearSession = jest.fn();
jest.mock("@/lib/auth/client-session", () => ({
  getSession: () => mockGetSession(),
  authHeaders: () => ({ Authorization: "Bearer access" }),
  clearSession: () => mockClearSession(),
}));

function res(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockReturnValue({
    accessToken: "access",
    refreshToken: "refresh",
    user: { id: "u-1", email: "user@example.com", name: "User" },
  });
  global.fetch = jest.fn() as unknown as typeof fetch;
});

describe("ChatButton", () => {
  it("renders nothing for signed-out visitors", () => {
    mockGetSession.mockReturnValue(null);
    const { container } = render(<ChatButton businessId={BUSINESS_ID} />);
    expect(container).toBeEmptyDOMElement();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("creates the conversation and deep-links into /chat", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      res(201, {
        success: true,
        data: {
          conversation: { id: CONVERSATION_ID, businessId: BUSINESS_ID },
          created: true,
        },
      })
    );
    render(<ChatButton businessId={BUSINESS_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(
        `/chat?conversation=${CONVERSATION_ID}`
      )
    );
    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[0]).toBe("/api/chat/conversations");
    expect(call[1].method).toBe("POST");
    expect(call[1].body).toBe(JSON.stringify({ businessId: BUSINESS_ID }));
    expect(call[1].headers).toMatchObject({ Authorization: "Bearer access" });
  });

  it("clears the session and routes to /login on 401", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      res(401, { success: false, error: "Unauthorized" })
    );
    render(<ChatButton businessId={BUSINESS_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/login"));
    expect(mockClearSession).toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("stays usable when the request fails", async () => {
    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.reject(new Error("network down"))
    );
    render(<ChatButton businessId={BUSINESS_ID} />);
    const button = screen.getByRole("button", { name: "Chat" });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeEnabled());
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
