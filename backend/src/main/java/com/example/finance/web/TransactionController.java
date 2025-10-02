package com.example.finance.web;

import com.example.finance.model.Transaction;
import com.example.finance.repo.TransactionRepository;
import com.example.finance.service.InsightsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/tx")
@CrossOrigin(origins = "http://localhost:5173")
public class TransactionController {

    private final TransactionRepository repo;
    private final InsightsService insights;

    // explicit constructor (no Lombok needed)
    public TransactionController(TransactionRepository repo, InsightsService insights) {
        this.repo = repo;
        this.insights = insights;
    }

    // ---- LIST with Java-side filtering and explicit param names ----
    @GetMapping
    public List<Transaction> list(
            @RequestParam(name = "q",        required = false) String q,
            @RequestParam(name = "from",     required = false) String from,
            @RequestParam(name = "to",       required = false) String to,
            @RequestParam(name = "category", required = false) String category
    ) {
        LocalDate fromDate = parseDate(from);
        LocalDate toDate   = parseDate(to);

        List<Transaction> all = repo.findAll();
        String qLower   = (q == null) ? "" : q.toLowerCase();
        String catLower = (category == null) ? "" : category.toLowerCase();

        List<Transaction> out = new ArrayList<>();
        for (Transaction t : all) {
            if (!qLower.isBlank()) {
                String merchant = t.getMerchant() == null ? "" : t.getMerchant().toLowerCase();
                String cat      = t.getCategory() == null ? "" : t.getCategory().toLowerCase();
                String notes    = t.getNotes() == null ? "" : t.getNotes().toLowerCase();
                if (!(merchant.contains(qLower) || cat.contains(qLower) || notes.contains(qLower))) continue;
            }
            if (fromDate != null && (t.getDate() == null || t.getDate().isBefore(fromDate))) continue;
            if (toDate   != null && (t.getDate() == null || t.getDate().isAfter(toDate)))   continue;
            if (!catLower.isBlank()) {
                String cat = t.getCategory() == null ? "" : t.getCategory().toLowerCase();
                if (!cat.equals(catLower)) continue;
            }
            out.add(t);
        }
        return out;
    }

    // ---- CRUD ----
    @GetMapping("/{id}")
    public ResponseEntity<Transaction> get(@PathVariable(name = "id") Long id) {
        return repo.findById(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public Transaction create(@RequestBody Transaction t) {
        t.setId(null);
        return repo.save(t);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable(name = "id") Long id) {
        if (!repo.existsById(id)) return ResponseEntity.notFound().build();
        repo.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    // ---- SUMMARY ----
    @GetMapping("/summary")
    public Map<String, Object> summary(@RequestParam(name = "month") String month) {
        YearMonth ym = YearMonth.parse(month);
        var list = repo.findByDateBetween(ym.atDay(1), ym.atEndOfMonth());

        Map<String, Double> byCat = new LinkedHashMap<>();
        double total = 0.0;
        for (var t : list) {
            double amt = (t.getAmount() == null) ? 0.0 : t.getAmount();
            total += amt;
            String cat = (t.getCategory() == null) ? "Uncategorized" : t.getCategory();
            byCat.put(cat, byCat.getOrDefault(cat, 0.0) + amt);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("month", month);
        out.put("total", Math.round(total * 100.0) / 100.0);
        out.put("byCategory", byCat);
        return out;
    }

    // ---- INSIGHTS (rule-based now; Ollama later) ----
    @GetMapping("/insights")
    public Map<String, String> insights(@RequestParam(name = "month") String month) {
        String text = insights.summarizeMonth(YearMonth.parse(month));
        return Map.of("month", month, "summary", text);
    }

    // ---- helper ----
    private LocalDate parseDate(String s) {
        if (s == null || s.isBlank()) return null;
        try { return LocalDate.parse(s); } catch (Exception e) { return null; }
    }
}
