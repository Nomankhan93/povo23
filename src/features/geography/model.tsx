export type Geo = {
  id: string;
  parent_id: string | null;
  kind: string;
  name: string;
  code: string;
  active: boolean;
  source_note: string;
};
export const levels = [
  "province",
  "division",
  "district",
  "taluka",
  "uc",
  "village",
];
export function geographyPath(id: string | null, rows: Geo[]) {
  const path: Geo[] = [];
  const seen = new Set<string>();
  let node = rows.find((g) => g.id === id);
  while (node && !seen.has(node.id)) {
    path.unshift(node);
    seen.add(node.id);
    node = rows.find((g) => g.id === node!.parent_id);
  }
  return path;
}
export function activeNode(g: Geo, rows: Geo[]) {
  return geographyPath(g.id, rows).every((p) => p.active);
}
