import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import * as path from "node:path";

config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  const masterEmployees = [
    { msnv: "EMP0001", fullName: "Nguyen Van A" },
    { msnv: "EMP0002", fullName: "Tran Thi B" },
    { msnv: "EMP0003", fullName: "Le Van C" },
    { msnv: "EMP0004", fullName: "Pham Thi D" },
    { msnv: "EMP0005", fullName: "Do Van E" }
  ];

  for (const employee of masterEmployees) {
    await prisma.employeeMaster.upsert({
      where: { msnv: employee.msnv },
      update: { fullName: employee.fullName },
      create: employee
    });
  }

  const nicknames = Array.from({ length: 100 }, (_, idx) => `Nguoi Bi Mat #${String(idx + 1).padStart(3, "0")}`);
  for (const label of nicknames) {
    await prisma.nicknamePool.upsert({
      where: { label },
      update: {},
      create: { label }
    });
  }

  const adminEmail = process.env.ADMIN_EMAIL_WHITELIST?.split(",")[0]?.trim();
  if (adminEmail) {
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: "ADMIN" },
      create: {
        email: adminEmail,
        googleSub: `bootstrap-${adminEmail}`,
        fullName: "System Admin",
        role: "ADMIN"
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
