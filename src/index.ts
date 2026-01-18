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
app.use((_, res, next) => {
    const headers = new Headers({
        "Access-Control-Allow-Origin": "http://127.0.0.1:5555",
        "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": "Content-Type",
    });
    res.setHeaders(headers);
    next();
});

/* APIs */
app.get("/", (_, res) => {
    res.send({ message: "hello" });
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
            const { upload_id: uploadId, total_index: totalIndex } = uploadSession;

            // Chunk size mismatch
            if (req.body.totalIndex !== totalIndex) {
                db.run("DELETE FROM chunks WHERE upload_id = ?", [uploadId]);
                db.run("UPDATE upload_sessions SET total_index = ?", [req.body.totalIndex]);
                // Delete files
                const dir = path.resolve(`./src/uploads/${req.body.filename}`);
                for (const name of fs.readdirSync(dir)) {
                    const p = path.join(dir, name);
                    fs.unlinkSync(p);
                }

                return res.json({
                    exist: false,
                    required: Array.from({ length: req.body.totalIndex }, (_, i) => i),
                    uploadId,
                });
            }

            // TODO: watch this
            const uploadedChunks = db
                .query("SELECT chunk_index FROM chunks WHERE upload_id = ?")
                .all(uploadId) as QueryChunkObject[];
            // Calculate all required chunks indice
            const existIndices = uploadedChunks.map((c) => c.chunk_index);

            return res.json({
                exist: false,
                required: Array.from({ length: totalIndex }, (_, i) => i).filter(
                    (indice) => !existIndices.includes(indice),
                ),
                uploadId,
            });
        }

        // Create upload session & folder when no upload session
        const uploadId = Math.random().toString(32).slice(2, 12) + Date.now();
        db.run(
            "INSERT INTO upload_sessions (upload_id, file_hash, filename, total_index) VALUES (?, ?, ?, ?)",
            [uploadId, req.body.fileHash, req.body.filename, req.body.totalIndex],
        );
        const dir = path.resolve(`./src/uploads/${req.body.filename}`);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }

        return res.json({
            exist: false,
            required: Array.from({ length: req.body.totalIndex }, (_, i) => i),
            uploadId,
        });
    },
);

/* Upload single chunk */
const upload = multer({ storage: multer.memoryStorage() });
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

        const dir = path.resolve(`./src/uploads/${req.body.filename}/`);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        const filename = `${req.body.chunkIndex}.bin`;

        fs.writeFileSync(path.join(dir, filename), req.file.buffer);

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
        db.run(
            "INSERT INTO chunks (upload_id, chunk_hash, chunk_index, total_index, chunk_size) VALUES (?, ?, ?, ?, ?)",
            [
                req.body.uploadId,
                req.body.chunkHash,
                Number(req.body.chunkIndex),
                Number(req.body.totalIndex),
                Number(req.body.chunkSize),
            ],
        );
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
        const uploadSession = db
            .query("SELECT file_hash FROM upload_sessions WHERE upload_id = ?")
            .get(req.body.uploadId) as QueryUploadSessionObject;
        const file = db
            .query("SELECT 1 FROM files WHERE file_hash = ?")
            .get(uploadSession.file_hash);
        if (file)
            return res.json({
                data: null,
                message: "File exists.",
            });

        const dir = path.resolve(`./src/uploads/${req.body.filename}`);
        const files = fs
            .readdirSync(dir)
            .sort((a, b) => Number(a.split(".")[0]) - Number(b.split(".")[0]));

        const targetPath = path.resolve(`./src/storage/${req.body.filename}`);
        const writeStream = fs.createWriteStream(targetPath);
        for (const filename of files) {
            const filePath = path.resolve(dir, filename);
            const filebuffer = fs.readFileSync(filePath);
            writeStream.write(filebuffer);
        }
        writeStream.close();

        writeStream.on("finish", () => {
            const { size } = fs.statSync(targetPath);
            db.run("INSERT INTO files (file_hash, file_size, filename) VALUES (?, ?, ?) ", [
                uploadSession.file_hash,
                size,
                req.body.filename,
            ]);

            return res.json({
                // PERF: what data is required?
                data: {},
                message: null,
            });
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
