export type Task = {
  id: string;
  name: string;
  trader: string;
  maps: string[];
  prerequisites: string[];
  tags: string[];
  kappaRequired?: boolean;
  wikiLink?: string | null;
  minPlayerLevel?: number | null;
  targets?: string[];
};