import path from "node:path";
import fs from "fs";
import express from "express";
import type { Request, Response } from "express";
import multer from "multer";
import crypto from "crypto";
import { db } from "./db/index";

/* Initiation */
const app = express();
app.use(express.json());

/* APIs */
app.get("/", (_, res) => {
    res.send("hello");
});

// Preflight the file existance
app.post(
    "/upload/check",
    (
        req: Request<{}, ResponseUploadCheck, RequestUploadCheck>,
        res: Response<ResponseUploadCheck>,
    ) => {
        // Validate file existance first
        const file = db
            .query("SELECT 1 FROM files WHERE file_hash = ?")
            .get(req.body.fileHash) as QueryFileObject;
        if (file) {
            return res.json({
                exist: true,
                required: null,
                uploadId: null,
            });
        }

        // Search upload session id when file doesn't exist
        const uploadSession = db
            .query("SELECT * FROM upload_sessions WHERE file_hash = ?")
            .get(req.body.fileHash) as QueryUploadSessionObject;

        if (uploadSession) {
            const { upload_id: uploadId } = uploadSession;

            const uploadedChunks = db
                .query("SELECT chunk_index, total_index FROM chunks WHERE upload_id = ?")
                .all(uploadId) as QueryChunkObject[];

            // No chunk has uploaded
            if (!uploadedChunks.length) {
                return res.json({
                    exist: false,
                    required: Array.from({ length: req.body.totalIndex }, (_, i) => i),
                    uploadId,
                });
            }

            const { total_index } = uploadedChunks[0]!;
            // Chunk size mismatch
            if (req.body.totalIndex !== total_index) {
                db.run("DELETE FROM upload_sessions WHERE file_hash = ?", [req.body.fileHash]);
                db.run("DELETE FROM chunks WHERE upload_id = ?", [uploadId]);
                fs.rmdirSync(path.resolve(`./src/uploads/${req.body.filename}`));

                return res.json({
                    exist: false,
                    required: Array.from({ length: req.body.totalIndex }, (_, i) => i),
                    uploadId,
                });
            }

            // Calculate all required chunks indice
            const existChunkIndices = uploadedChunks.map((chunk) => chunk.chunk_index);
            return res.json({
                exist: false,
                required: Array.from({ length: total_index }, (_, i) => i).filter(
                    (indice) => !existChunkIndices.includes(indice),
                ),
                uploadId,
            });
        }

        // Create upload session & folder
        const uploadId = Math.random().toString(32).slice(2, 12) + Date.now();
        db.run(
            "INSERT INTO upload_sessions (upload_id, file_hash, filename, chunk_size) VALUES (?, ?, ?, ?)",
            [uploadId, req.body.fileHash, req.body.filename, req.body.chunkSize],
        );
        fs.mkdirSync(path.resolve(`./src/uploads/${req.body.filename}`));

        return res.json({
            exist: false,
            required: Array.from({ length: req.body.totalIndex }, (_, i) => i),
            uploadId,
        });
    },
);

/* Upload single chunk */
const storage = multer.diskStorage({
    destination: (_1, file, callback) => {
        const dir = path.resolve(`./src/uploads/${file.originalname}`);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        callback(null, dir);
    },
    filename: (req, file, callback) => {
        const name = file.originalname.replace(/\.[^/.]+$/, "");
        callback(null, `${name}-${req.body.chunkIndex}`);
    },
});
const upload = multer({ storage });
app.post(
    "/upload/chunk",
    upload.single("file"),
    (
        req: Request<{}, ResponseUploadChunk, RequestUploadChunk>,
        res: Response<ResponseUploadChunk>,
    ) => {
        if (!req.file) {
            return res.json({
                data: null,
                message: "Required entity file.",
            });
        }

        const dir = path.resolve(`./src/uploads/${req.file.originalname}/`);
        const filename = req.file.filename;
        const filebuffer = fs.readFileSync(path.resolve(dir, filename));
        const hash = crypto.createHash("sha256").update(filebuffer).digest("hex");

        // Chunk hash mismatch
        if (hash !== req.body.chunkHash) {
            return res.json({
                data: null,
                message: "Chunk hash mismatch.",
            });
        }

        // Save chunk to database
        db.run("INSERT INTO chunks (upload_id, chunk_hash, chunk_index, total_index, chunk_size)", [
            req.body.uploadId,
            req.body.chunkHash,
            Number(req.body.chunkIndex),
            Number(req.body.totalIndex),
            Number(req.body.chunkSize),
        ]);
        return res.json({
            // PERF: what data is required?
            data: {},
            message: null,
        });
    },
);

/* Merge all chunks */
app.post(
    "/upload/merge",
    (req: Request<{}, ResponseMerge, RequestMerge>, res: Response<ResponseMerge>) => {
        const dir = path.resolve(`./src/uploads/${req.body.filename}`);
        const files = fs.readdirSync(dir);

        const targetPath = path.resolve(`./src/storage/${req.body.filename}`);
        const writeStream = fs.createWriteStream(targetPath);
        for (const filename of files) {
            const filePath = path.resolve(dir, filename);
            const filebuffer = fs.readFileSync(filePath);
            writeStream.write(filebuffer);
        }
        writeStream.close();

        return res.json({
            // PERF: what data is required?
            data: {},
            message: null,
        });
    },
);

// Clean up uploads folder
const uploadsDir = path.resolve("./src/uploads/");
setInterval(
    () => {
        const folders = fs.readdirSync(uploadsDir);
        for (const folder of folders) {
            fs.unlinkSync(path.resolve(uploadsDir, folder));
        }
    },
    12 * 60 * 60 * 1000,
);

app.listen(3000, () => {
    console.log("3000");
});
