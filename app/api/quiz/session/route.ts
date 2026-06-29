import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    let requestedGroup: string | null = null;
    let userAge: number | null = null;
    let footballInterest: number | null = null;
    let userId: string | null = null;

    try {
      const body = await request.json();
      requestedGroup = body.testGroup;
      userAge = body.userAge;
      footballInterest = body.footballInterest;
      userId = body.userId;
    } catch (e) {
      // Body might be empty
    }

    let testGroup = requestedGroup;
    if (!testGroup) {
      const rand = Math.random();
      if (rand < 0.33) testGroup = 'control';
      else if (rand < 0.66) testGroup = 'llm';
      else testGroup = 'mers';
    }

    const { data, error } = await supabaseAdmin
      .from("quiz_sessions")
      .insert({
        test_group: testGroup,
        user_age: userAge,
        football_interest: footballInterest,
        user_id: userId
      })
      .select("id")
      .single();

    if (error) {
      console.error("Error creating session:", error);
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }

    return NextResponse.json({ sessionId: data.id, testGroup }, { status: 201 });
  } catch (error) {
    console.error("Server error creating session:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
