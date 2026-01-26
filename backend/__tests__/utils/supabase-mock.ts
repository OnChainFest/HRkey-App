import { jest } from "@jest/globals";
type SupabaseResponse = { data: unknown; error: null | { message: string; code?: string } };

type TableResponses = {
  selectResponses?: SupabaseResponse[];
  insertResponses?: SupabaseResponse[];
  updateResponses?: SupabaseResponse[];
  deleteResponses?: SupabaseResponse[];
  singleResponses?: SupabaseResponse[];
  maybeSingleResponses?: SupabaseResponse[];
};

const defaultResponse = (): SupabaseResponse => ({ data: null, error: null });

const dequeue = (queue?: SupabaseResponse[]) => (queue && queue.length > 0 ? queue.shift() : defaultResponse());

const createTableMock = (responses: TableResponses = {}) => {
  let currentAction: keyof TableResponses = 'selectResponses';

  const api: Record<string, any> = {
    select: jest.fn(() => {
      currentAction = 'selectResponses';
      return api;
    }),
    insert: jest.fn(() => {
      currentAction = 'insertResponses';
      return api;
    }),
    update: jest.fn(() => {
      currentAction = 'updateResponses';
      return api;
    }),
    delete: jest.fn(() => {
      currentAction = 'deleteResponses';
      return api;
    }),
    eq: jest.fn(() => api),
    order: jest.fn(() => api),
    single: jest.fn(async () => dequeue(responses.singleResponses)),
    maybeSingle: jest.fn(async () => dequeue(responses.maybeSingleResponses)),
    then: (resolve: (value: SupabaseResponse) => void, reject: (reason?: unknown) => void) =>
      Promise.resolve(dequeue(responses[currentAction] as SupabaseResponse[])).then(resolve, reject)
  };

  return { api, responses };
};

export const createSupabaseMock = () => {
  const tables: Record<string, ReturnType<typeof createTableMock>> = {};

  const getTable = (table: string) => {
    if (!tables[table]) {
      tables[table] = createTableMock();
    }
    return tables[table];
  };

  const supabase = {
    from: jest.fn((table: string) => getTable(table).api)
  };

  const setTableResponses = (table: string, responses: TableResponses) => {
    tables[table] = createTableMock(responses);
  };

  return { supabase, tables, setTableResponses };
};

export const mockSuccess = (data: unknown): SupabaseResponse => ({ data, error: null });
export const mockError = (message: string, code?: string): SupabaseResponse => ({
  data: null,
  error: { message, code }
});
