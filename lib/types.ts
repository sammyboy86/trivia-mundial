export interface Question {
  id: string;
  associated_kc_id: string | null;
  hint: string | null;
  answer_explanation: string | null;
  question_text: string;
  question_type: "multiple_choice" | "true_false" | "open_ended";
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_option: string;
  created_at: string;
}

export interface QuestionFormData {
  associated_kc_id: string;
  hint: string;
  answer_explanation: string;
  question_text: string;
  question_type: "multiple_choice" | "true_false" | "open_ended";
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
}
