import { describe, it, expect } from "vitest";

/**
 * Mirrors the RLS WITH CHECK on public.chat_messages INSERT:
 *   auth.uid() = user_id
 *   AND EXISTS (
 *     SELECT 1 FROM chat_conversations c
 *     WHERE c.id = conversation_id AND c.user_id = auth.uid()
 *   )
 *
 * This unit test asserts the policy's intent: a user cannot insert a message
 * into a conversation owned by another user.
 */

type Conversation = { id: string; user_id: string };
type MessageInsert = {
  conversation_id: string;
  user_id: string;
  content: string;
  role: "user" | "assistant";
};

function canInsertChatMessage(
  authUid: string | null,
  msg: MessageInsert,
  conversations: Conversation[]
): boolean {
  if (!authUid) return false;
  if (authUid !== msg.user_id) return false;
  const convo = conversations.find((c) => c.id === msg.conversation_id);
  if (!convo) return false;
  return convo.user_id === authUid;
}

describe("chat_messages INSERT policy (conversation ownership)", () => {
  const userA = "00000000-0000-0000-0000-00000000000a";
  const userB = "00000000-0000-0000-0000-00000000000b";
  const convoA = { id: "convo-a", user_id: userA };
  const convoB = { id: "convo-b", user_id: userB };
  const conversations = [convoA, convoB];

  it("allows a user to insert into their own conversation", () => {
    const result = canInsertChatMessage(
      userA,
      {
        conversation_id: convoA.id,
        user_id: userA,
        content: "hi",
        role: "user",
      },
      conversations
    );
    expect(result).toBe(true);
  });

  it("REJECTS inserting a message into another user's conversation", () => {
    // userA tries to write into userB's conversation, even though they set user_id = userA
    const result = canInsertChatMessage(
      userA,
      {
        conversation_id: convoB.id,
        user_id: userA,
        content: "sneaky",
        role: "user",
      },
      conversations
    );
    expect(result).toBe(false);
  });

  it("rejects spoofing user_id to match the conversation owner", () => {
    // userA tries to impersonate userB by setting user_id = userB
    const result = canInsertChatMessage(
      userA,
      {
        conversation_id: convoB.id,
        user_id: userB,
        content: "spoof",
        role: "user",
      },
      conversations
    );
    expect(result).toBe(false);
  });

  it("rejects unauthenticated inserts", () => {
    const result = canInsertChatMessage(
      null,
      {
        conversation_id: convoA.id,
        user_id: userA,
        content: "anon",
        role: "user",
      },
      conversations
    );
    expect(result).toBe(false);
  });

  it("rejects inserts referencing a non-existent conversation", () => {
    const result = canInsertChatMessage(
      userA,
      {
        conversation_id: "convo-missing",
        user_id: userA,
        content: "ghost",
        role: "user",
      },
      conversations
    );
    expect(result).toBe(false);
  });
});
