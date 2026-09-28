export enum LogAction {
  CREATE = 'CREATE',
  FORCE_CREATE = 'FORCE_CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  IMPORT = 'IMPORT',
}

export enum LogStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUSED = 'REFUSED',
}
