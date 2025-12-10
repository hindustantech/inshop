// services/walletService.js
import mongoose from "mongoose";
import Wallet from "../models/Wallet.js";
import Transaction from "../models/Transaction.js";
import { AppError } from "../utils/AppError.js";

export async function ensureWallet(userId, session = null) {
    let wallet = await Wallet.findOne({ userId }).session(session || null);

    if (!wallet) {
        const [created] = await Wallet.create(
            [{ userId, balance: 0, reserved: 0 }],
            { session: session || undefined }
        );
        wallet = created;
    }
    return wallet;
}

/**
 * Atomic credit/debit with ledger transaction.
 * MUST be called inside a MongoDB session (transaction).
 */
export async function applyWalletTransaction({
    session,
    wallet,
    userId,
    type,
    direction,
    amountPaise,
    currency = "INR",
    external = {},
    idempotencyKey,
    referenceId,
    note,
    metadata = {},
}) {
    if (!session) {
        throw new AppError("Session required for wallet transaction", 500);
    }

    // Strong idempotency at transaction level
    if (idempotencyKey) {
        const existing = await Transaction.findOne({ idempotencyKey }).session(session);
        if (existing) return existing;
    }

    const balanceBefore = wallet.balance;
    const delta = direction === "credit" ? amountPaise : -amountPaise;
    const balanceAfter = balanceBefore + delta;

    if (balanceAfter < 0) {
        throw new AppError("Insufficient wallet balance", 400, "INSUFFICIENT_BALANCE");
    }

    const tx = new Transaction({
        walletId: wallet._id,
        userId,
        type,
        direction,
        amount: amountPaise,
        balanceBefore,
        balanceAfter,
        currency,
        status: "success",
        idempotencyKey,
        external,
        referenceId,
        note,
        metadata,
    });

    wallet.balance = balanceAfter;
    wallet.lastTransactionAt = new Date();

    await tx.save({ session });
    await wallet.save({ session });

    // TODO: Emit domain event here (Kafka/Redis/etc)
    // emitEvent("transaction.created", { txId: tx._id, userId, amountPaise });

    return tx;
}
