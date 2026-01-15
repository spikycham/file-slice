type ResponseUploadCheck =
    | {
          exist: true;
          required: null;
          uploadId: null;
      }
    | {
          exist: false;
          required: number[];
          uploadId: string;
      };
type RequestUploadCheck = {
    fileHash: string;
    fileSize: number;
    chunkSize: number;
    totalIndex: number;
    filename: string;
};

/* Query result of select data from db */
interface QueryFileObject {
    file_hash: string;
    file_size: number;
    filename: string;
}
interface QueryUploadSessionObject {
    upload_id: string;
    file_hash: string;
    filename: string;
    chunk_size: number;
}
interface QueryChunkObject {
    // upload_id: string;
    // chunk_hash: string;
    chunk_index: number;
    total_index: number;
    // chunk_size: number;
}
