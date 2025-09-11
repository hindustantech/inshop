import { Parser } from "json2csv";

export const exportToCSV = (res, data, filename) => {
  try {
    const parser = new Parser();
    const csv = parser.parse(data);

    res.header("Content-Type", "text/csv");
    res.attachment(filename);
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ success: false, message: "CSV Export Failed", error: err.message });
  }
};
