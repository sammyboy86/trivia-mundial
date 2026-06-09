export interface Question {
  id: string;
  question_text: string;
  question_type: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_option: string;
}

export interface QuestionFormData {
  question_text: string;
  question_type: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
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
  question_text: "",
  question_type: "multiple_choice",
  option_a: "",
  option_b: "",
  option_c: "",
  option_d: "",
  correct_option: "a",
};
