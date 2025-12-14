import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    try {
        console.log("Checking Asset...")
        // Just check if we can query
        const asset = await prisma.asset.findFirst()
        console.log("Asset check passed")

        console.log("Checking Transaction Model fields...")
        // We can't easily inspect types at runtime, but we can try to create (and rollback) or just see if it throws validation error.

        // Let's try to create a dummy transaction with currency.
        // We need an asset first.
        const symbol = "TEST.PRISMA"
        await prisma.asset.upsert({
            where: { symbol },
            update: {},
            create: { symbol, name: "Test Asset" }
        })

        const tx = await prisma.transaction.create({
            data: {
                assetId: symbol,
                type: 'BUY',
                quantity: 1,
                price: 100,
                // @ts-ignore
                currency: 'USD',
                date: new Date()
            }
        })
        console.log("Transaction created with currency:", tx)

        // Clean up
        await prisma.transaction.delete({ where: { id: tx.id } })
        await prisma.asset.delete({ where: { symbol } })

    } catch (e) {
        console.error("Prisma Check Failed:", e)
    } finally {
        await prisma.$disconnect()
    }
}

main()
