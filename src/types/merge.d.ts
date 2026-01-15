type ResponseMerge =
    | {
          data: {};
          message: null;
      }
    | {
          data: null;
          message: string;
      };

interface RequestMerge {
    uploadId: string;
    filename: string;
}
