import { supabase } from "@/lib/supabase-client";
import type { Question } from "@/lib/types";

// The algorithm to use for question selection
// This provides a foundation for A/B testing different question order strategies
export type QuestionSelectionAlgorithm = "random" | "spaced_repetition" | "difficulty";

export async function getQuizQuestions(
  algorithm: QuestionSelectionAlgorithm = "random",
  limit: number = 20
): Promise<Question[]> {
  switch (algorithm) {
    case "random":
      return getRandomQuestions(limit);
    // Add other algorithmic cases here in the future for A/B testing
    default:
      return getRandomQuestions(limit);
  }
}

/**
 * Fetches completely random questions across the entire database.
 * This ensures that even if we have 1000 questions, everyone gets a truly random subset.
 */
async function getRandomQuestions(limit: number): Promise<Question[]> {
  // 1. Fetch all question IDs to ensure completely random selection
  const { data: idData, error: idError } = await supabase
    .from("questions")
    .select("id");

  if (idError) {
    console.error("Failed to load question IDs:", idError);
    return [];
  }

  const allIds = idData?.map((q) => q.id) || [];

  // 2. If we have fewer questions than the limit, just return all of them
  if (allIds.length <= limit) {
    const { data, error } = await supabase.from("questions").select("*");

    if (error) {
      console.error("Failed to load questions:", error);
      return [];
    }
    return shuffleArray(data || []);
  }

  // 3. Shuffle IDs and pick the top `limit`
  const selectedIds = shuffleArray(allIds).slice(0, limit);

  // 4. Fetch the full questions for those randomly selected IDs
  const { data: questionsData, error: questionsError } = await supabase
    .from("questions")
    .select("*")
    .in("id", selectedIds);

  if (questionsError) {
    console.error("Failed to load selected questions:", questionsError);
    return [];
  }

  // 5. Shuffle the results again since the `in` clause might return them in primary key order
  return shuffleArray(questionsData || []);
}

/**
 * Utility to shuffle an array in-place using the Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}
