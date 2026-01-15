type ResponseUploadChunk =
    | {
          data: {};
          message: null;
      }
    | {
          data: null;
          message: string;
      };

type RequestUploadChunk = Request & {
    file: Express.Multer.File;
    chunkIndex: string;
    totalIndex: string;
    chunkSize: string;
    chunkHash: string; // compare the chunk hash generated locally by chunk file object
    uploadId: string;
};
