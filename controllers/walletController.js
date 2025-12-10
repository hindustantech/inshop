import { ensureWallet } from "../services/walletService.js";
import Transaction from "../models/Transaction.js";

export async function getWalletSummary(req, res, next) {
  try {
    const userId = req.user._id;
    const wallet = await ensureWallet(userId);

    return res.json({
      success: true,
      data: {
        walletId: wallet._id,
        balance: wallet.balance / 100,
        reserved: wallet.reserved / 100,
        currency: wallet.currency,
        status: wallet.status,
        lastTransactionAt: wallet.lastTransactionAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getWalletTransactions(req, res, next) {
  try {
    const userId = req.user._id;
    const { limit = 50, page = 1, type } = req.query;

    const wallet = await ensureWallet(userId);
    
    const query = { walletId: wallet._id };
    if (type) query.type = type;

    const txs = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    const total = await Transaction.countDocuments(query);

    return res.json({
      success: true,
      data: txs.map(tx => ({
        ...tx,
        amount: tx.amount / 100,
        balanceBefore: tx.balanceBefore / 100,
        balanceAfter: tx.balanceAfter / 100
      })),
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
}