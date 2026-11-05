import * as fs from 'node:fs/promises';
export async function replaceDirectory(staged, destination, operations = fs) {
  const previous = staged + '-previous';
  let hadPrevious = false;
  try {
    await operations.rename(destination, previous);
    hadPrevious = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await operations.rename(staged, destination);
  } catch (error) {
    if (hadPrevious) {
      try {
        await operations.rename(previous, destination);
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          'Replacement and rollback failed; previous output retained at ' + previous,
          { cause: restoreError }
        );
      }
    }
    throw error;
  }
  if (hadPrevious) {
    try {
      await operations.rm(previous, { recursive: true, force: true });
    } catch (error) {
      // Deletion may have been partial: restoring the old tree now could corrupt the live package.
      const message =
        'Replacement committed at ' +
        destination +
        '; previous-output cleanup failed. Backup may remain or be incomplete at ' +
        previous;
      const committedError = new Error(message, { cause: error });
      committedError.committed = true;
      committedError.destination = destination;
      committedError.previousBackup = previous;
      throw committedError;
    }
  }
}
