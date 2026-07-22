// bedrockPing.js
// Minecraft Bedrock (RakNet) "Unconnected Ping" implementasiyasi.
// Hech qanday tashqi kutubxonasiz, faqat Node.js ning ichki "dgram" moduli orqali ishlaydi.

const dgram = require('dgram');

// RakNet protokolida belgilangan doimiy "magic" baytlar to'plami
const RAKNET_MAGIC = Buffer.from([
  0x00, 0xff, 0xff, 0x00, 0xfe, 0xfe, 0xfe, 0xfe,
  0xfd, 0xfd, 0xfd, 0xfd, 0x12, 0x34, 0x56, 0x78
]);

const UNCONNECTED_PING_ID = 0x01;
const UNCONNECTED_PONG_ID = 0x1c;

function buildPingPacket() {
  const buf = Buffer.alloc(1 + 8 + 16 + 8);
  let offset = 0;
  buf.writeUInt8(UNCONNECTED_PING_ID, offset); offset += 1;
  // vaqt belgisi (timestamp) - 8 bayt, ahamiyati yo'q, istalgan qiymat bo'lishi mumkin
  buf.writeBigUInt64BE(BigInt(Date.now()), offset); offset += 8;
  RAKNET_MAGIC.copy(buf, offset); offset += 16;
  // client GUID - 8 bayt, tasodifiy son
  buf.writeBigUInt64BE(BigInt(Math.floor(Math.random() * 1e15)), offset);
  return buf;
}

/**
 * Berilgan IP va portdagi Bedrock serverini "ping" qiladi.
 * @param {string} host - server IP yoki domen manzili
 * @param {number} port - server porti (odatda 19132)
 * @param {number} timeoutMs - kutish vaqti (millisekund)
 * @returns {Promise<{online: boolean, motd?: string, playersOnline?: number, playersMax?: number, version?: string, protocol?: string, latencyMs?: number}>}
 */
function pingBedrockServer(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    let settled = false;
    const start = Date.now();

    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { socket.close(); } catch (e) { /* ignore */ }
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ online: false, reason: 'timeout' });
    }, timeoutMs);

    socket.on('error', () => {
      clearTimeout(timer);
      finish({ online: false, reason: 'socket_error' });
    });

    socket.on('message', (msg) => {
      clearTimeout(timer);
      try {
        if (msg.length < 1 || msg.readUInt8(0) !== UNCONNECTED_PONG_ID) {
          return finish({ online: false, reason: 'bad_response' });
        }
        // Struktura: id(1) + timestamp(8) + serverGUID(8) + magic(16) + stringLen(2, BE) + string
        let offset = 1 + 8 + 8 + 16;
        if (msg.length < offset + 2) {
          return finish({ online: false, reason: 'bad_response' });
        }
        const strLen = msg.readUInt16BE(offset); offset += 2;
        const str = msg.slice(offset, offset + strLen).toString('utf8');
        const parts = str.split(';');
        // MCPE;MOTD;protocolVersion;version;playersOnline;playersMax;serverId;subMotd;gamemode;...
        const motd = parts[1] || '';
        const protocol = parts[2] || '';
        const version = parts[3] || '';
        const playersOnline = parseInt(parts[4], 10);
        const playersMax = parseInt(parts[5], 10);

        finish({
          online: true,
          motd,
          protocol,
          version,
          playersOnline: Number.isFinite(playersOnline) ? playersOnline : 0,
          playersMax: Number.isFinite(playersMax) ? playersMax : 0,
          latencyMs: Date.now() - start
        });
      } catch (e) {
        finish({ online: false, reason: 'parse_error' });
      }
    });

    try {
      const packet = buildPingPacket();
      socket.send(packet, 0, packet.length, port, host);
    } catch (e) {
      clearTimeout(timer);
      finish({ online: false, reason: 'send_error' });
    }
  });
}

module.exports = { pingBedrockServer };
