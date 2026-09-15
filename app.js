let device = null;

const VID = 0x2B41;
const PID = 0x0520;

const INTERFACE_NUM = 0;
const OUT_EP = 3;
const IN_EP = 2;
alert("APP.JS VERSION 3");
const connectButton = document.getElementById("connectButton");
const sendButton = document.getElementById("sendButton");
const statusText = document.getElementById("status");
const receiveButton = document.getElementById("receiveButton");

const jpgFile = document.getElementById("jpgFile");
const sendJpgButton = document.getElementById("sendJpgButton");

const speedTestButton = document.getElementById("speedTestButton");

const speedResult = document.getElementById("speedResult");

const usbSupport = document.getElementById("usbSupport");

if ("usb" in navigator) {
    usbSupport.textContent = "WebUSB supported: YES";
} else {
    usbSupport.textContent = "WebUSB supported: NO";
}

receiveButton.addEventListener("click", async () => {

    if (!device || !device.opened) {
        statusText.textContent = "STM32 not connected";
        return;
    }

    try {
        console.log("Waiting Bulk IN...");

        const result = await device.transferIn(IN_EP, 1);

        console.log("transferIn status =", result.status);

        if (result.status !== "ok") {
            statusText.textContent =
                "Bulk IN status = " + result.status;
            return;
        }

        const data = new Uint8Array(
            result.data.buffer,
            result.data.byteOffset,
            result.data.byteLength
        );

        console.log("Received bytes =", data.length);

        const hex = Array.from(data)
            .map(x => x.toString(16).padStart(2, "0"))
            .join(" ");

        console.log("RX =", hex);

        statusText.textContent =
            `RX ${data.length} bytes: ${hex}`;

    } catch (error) {
        console.error("Bulk IN Error:", error);
        statusText.textContent =
            "Bulk IN Error: " + error.message;
    }
});

connectButton.addEventListener("click", async () => {

    try {
        //device = await navigator.usb.requestDevice({
        //    filters: [
        //        {
        //            vendorId: VID,
        //            productId: PID
        //        }
        //    ]
        //});
        device = await navigator.usb.requestDevice({
            filters: []
        });

        await device.open();

        if (device.configuration === null) {
            await device.selectConfiguration(1);
        }

        await device.claimInterface(INTERFACE_NUM);

        const iface = device.configuration.interfaces.find(
            x => x.interfaceNumber === INTERFACE_NUM
        );

        console.log("Interface claimed =", iface.claimed);

        statusText.textContent = "STM32 Connected";
        console.log("STM32 connected");

    } catch (error) {

        console.error("USB Error:", error);
        statusText.textContent = "USB Error: " + error.message;
    }
});


sendButton.addEventListener("click", async () => {

    if (!device || !device.opened) {
        statusText.textContent = "STM32 not connected";
        return;
    }

    try {

        const data = new Uint8Array([
            0x11,
            0x22,
            0x33,
            0x44
        ]);

        console.log("Sending:", data);

        const result = await device.transferOut(
            OUT_EP,
            data
        );

        console.log("transferOut status =", result.status);
        console.log("bytesWritten =", result.bytesWritten);

        statusText.textContent =
            `Send OK, ${result.bytesWritten} bytes`;

    } catch (error) {

        console.error("Bulk OUT Error:", error);
        statusText.textContent =
            "Bulk OUT Error: " + error.message;
    }
});

sendJpgButton.addEventListener("click", async () => {

    if (!device || !device.opened) {
        statusText.textContent = "STM32 not connected";
        return;
    }

    if (jpgFile.files.length === 0) {
        statusText.textContent = "Please select JPG";
        return;
    }

    try {
        const file = jpgFile.files[0];

        // ==========================================
        // 1. 讀取 JPG
        // ==========================================
        const t0 = performance.now();

        const jpgBuffer = await file.arrayBuffer();
        const jpgData = new Uint8Array(jpgBuffer);

        const t1 = performance.now();

        const jpgSize = jpgData.length;

        // ==========================================
        // 2. 建立 [4-byte size][JPG]
        // ==========================================
        const txData = new Uint8Array(4 + jpgSize);

        txData[0] = (jpgSize) & 0xFF;
        txData[1] = (jpgSize >> 8) & 0xFF;
        txData[2] = (jpgSize >> 16) & 0xFF;
        txData[3] = (jpgSize >> 24) & 0xFF;

        txData.set(jpgData, 4);

        const t2 = performance.now();

        // ==========================================
        // 3. 只量 WebUSB transferOut
        // ==========================================
        const result = await device.transferOut(
            OUT_EP,
            txData
        );

        const t3 = performance.now();

        if (result.status !== "ok") {
            throw new Error(
                "Bulk OUT failed: " + result.status
            );
        }

        const fileReadTime = t1 - t0;
        const buildTime = t2 - t1;
        const usbTime = t3 - t2;
        const totalTime = t3 - t0;

        statusText.innerHTML =
            `JPG = ${jpgSize} bytes<br>` +
            `TX = ${result.bytesWritten} bytes<br>` +
            `File read = ${fileReadTime.toFixed(2)} ms<br>` +
            `Build = ${buildTime.toFixed(2)} ms<br>` +
            `<b>USB transferOut = ${usbTime.toFixed(2)} ms</b><br>` +
            `Total = ${totalTime.toFixed(2)} ms`;

    } catch (error) {

        statusText.textContent =
            "ERROR: " +
            error.name + ": " +
            error.message;
    }
});

speedTestButton.addEventListener("click", async () => {

    if (!device || !device.opened) {
        statusText.textContent = "STM32 not connected";
        return;
    }

    if (jpgFile.files.length === 0) {
        statusText.textContent = "Please select JPG";
        return;
    }

    try {
        // ==========================================
        // 讀真正 JPG
        // ==========================================
        const file = jpgFile.files[0];

        const jpgBuffer = await file.arrayBuffer();
        const jpgData = new Uint8Array(jpgBuffer);
        const jpgSize = jpgData.length;

        speedResult.textContent =
            `JPG: ${file.name}\n` +
            `JPG size: ${jpgSize} bytes\n\n`;

        /*
         * 每次測試仍然送同一張完整 JPG。
         *
         * 0 = 整張 [header + JPG] 一次 transferOut
         *
         * 其他值 = header 先送，
         *          JPG 再依指定 chunk size 傳送
         */
        const chunkSizes = [
            0,
            512,
            1024,
            2048,
            4096,
            8192,
            16384
        ];

        for (const chunkSize of chunkSizes) {

            statusText.textContent =
                chunkSize === 0
                    ? "Testing Single Transfer..."
                    : `Testing ${chunkSize} byte chunks...`;

            let totalTime = 0;

            // ======================================
            // Case 1:
            // [4-byte header + JPG] 一次 transferOut
            // ======================================

            if (chunkSize === 0) {

                const txData =
                    new Uint8Array(4 + jpgSize);

                txData[0] = (jpgSize) & 0xFF;
                txData[1] = (jpgSize >> 8) & 0xFF;
                txData[2] = (jpgSize >> 16) & 0xFF;
                txData[3] = (jpgSize >> 24) & 0xFF;

                txData.set(jpgData, 4);

                const t0 = performance.now();

                const result =
                    await device.transferOut(
                        OUT_EP,
                        txData
                    );

                const t1 = performance.now();

                totalTime = t1 - t0;

                if (result.status !== "ok") {
                    throw new Error(
                        "Single transfer failed"
                    );
                }

                speedResult.textContent +=
                    `Single : ` +
                    `${totalTime.toFixed(2)} ms\n`;
            }

            // ======================================
            // Case 2:
            // Header 4 bytes
            // +
            // JPG chunked transfer
            // ======================================

            else {

                // ---------- Header ----------
                const header = new Uint8Array(4);

                header[0] = (jpgSize) & 0xFF;
                header[1] = (jpgSize >> 8) & 0xFF;
                header[2] = (jpgSize >> 16) & 0xFF;
                header[3] = (jpgSize >> 24) & 0xFF;

                const t0 = performance.now();

                let result =
                    await device.transferOut(
                        OUT_EP,
                        header
                    );

                if (result.status !== "ok") {
                    throw new Error(
                        "Header transfer failed"
                    );
                }

                // ---------- JPG ----------
                let offset = 0;

                while (offset < jpgSize) {

                    const end =
                        Math.min(
                            offset + chunkSize,
                            jpgSize
                        );

                    const chunk =
                        jpgData.subarray(
                            offset,
                            end
                        );

                    result =
                        await device.transferOut(
                            OUT_EP,
                            chunk
                        );

                    if (result.status !== "ok") {
                        throw new Error(
                            `Transfer failed ` +
                            `at offset ${offset}`
                        );
                    }

                    if (result.bytesWritten !==
                        chunk.length) {

                        throw new Error(
                            `Short transfer ` +
                            `${result.bytesWritten}/` +
                            `${chunk.length}`
                        );
                    }

                    offset +=
                        result.bytesWritten;
                }

                const t1 = performance.now();

                totalTime = t1 - t0;

                speedResult.textContent +=
                    `${chunkSize.toString().padStart(5)} B : ` +
                    `${totalTime.toFixed(2)} ms\n`;
            }

            /*
             * 非常重要：
             * 同一張 JPG 已經完整送完。
             *
             * 給 STM32 一點時間完成目前圖片處理，
             * 再開始下一輪完整 JPG。
             *
             * 這 1000 ms 不包含在 totalTime。
             */
            await new Promise(resolve =>
                setTimeout(resolve, 1000)
            );
        }

        statusText.textContent =
            "JPG Speed Test Complete";

    } catch (error) {

        console.error(error);

        statusText.textContent =
            "Speed Test ERROR: " +
            error.name + ": " +
            error.message;
    }
});