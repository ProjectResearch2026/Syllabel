export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
  items?: { name: string; note: string }[];
  streaming?: boolean;
};
