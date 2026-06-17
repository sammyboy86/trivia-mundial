export interface Question {
  id: string;
  associated_kc_id: string | null;
  hint: string | null;
  answer_explanation: string | null;
  topic: string | null;
  question_text: string;
  question_type: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_option: string;
  metadata?: any;
}

export interface QuestionFormData {
  associated_kc_id: string;
  hint: string;
  answer_explanation: string;
  topic: string;
  question_text: string;
  question_type: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  metadata_str: string;
}

export interface MarkdownFile {
  storageName: string;
  originalName: string;
  size: number;
  createdAt: string;
}

export interface ResultFile {
  storageName: string;
  type: "extraction" | "processing";
  totalChunks: number;
  totalResults: number;
  customName: string;
  size?: number;
  createdAt: string;
}

export const emptyForm: QuestionFormData = {
  associated_kc_id: "",
  hint: "",
  answer_explanation: "",
  topic: "",
  question_text: "",
  question_type: "multiple_choice",
  option_a: "",
  option_b: "",
  option_c: "",
  option_d: "",
  correct_option: "a",
  metadata_str: "{}",
};
