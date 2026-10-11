export interface EditRevision {
  revision: number;
  savedRevision: number;
}
export const markEdited = (state: EditRevision): EditRevision => ({
  ...state,
  revision: state.revision + 1,
});
export const saveRevision = (state: EditRevision): number => state.revision;
export const acknowledgeSave = (state: EditRevision, submitted: number): EditRevision => ({
  ...state,
  savedRevision: submitted,
});
