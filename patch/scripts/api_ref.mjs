const AUTH = "Basic " + Buffer.from("opencode:843a5c69-1886-4ee8-82ab-5ce0c32411cb").toString("base64");

async function main() {
  const dir = encodeURIComponent("D:/新项目/优化opencode");
  const url = `http://127.0.0.1:55152/api/reference?directory=${dir}&location[directory]=${dir}`;
  try {
    const r = await fetch(url, { headers: { Authorization: AUTH } });
    const text = await r.text();
    console.log("status:", r.status);
    console.log(text.slice(0, 2000));
  } catch (e) {
    console.log("ERR", e.message);
  }
}

main();
