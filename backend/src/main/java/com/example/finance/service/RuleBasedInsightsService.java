package com.example.finance.service;

import com.example.finance.model.Transaction;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;
import com.example.finance.repo.TransactionRepository;
import com.example.finance.model.Transaction;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Primary
@RequiredArgsConstructor
public class RuleBasedInsightsService implements InsightsService {

    private final TransactionRepository repo;

    @Override
    public String summarizeMonth(YearMonth month) {
        LocalDate start = month.atDay(1);
        LocalDate end = month.atEndOfMonth();

        List<Transaction> current = repo.findByDateBetween(start, end);
        if (current.isEmpty()) {
            return "No spending recorded for " + month + ".";
        }

        double total = current.stream().mapToDouble(t -> Optional.ofNullable(t.getAmount()).orElse(0.0)).sum();
        Map<String, Double> byCat = current.stream().collect(Collectors.groupingBy(
                t -> Optional.ofNullable(t.getCategory()).orElse("Uncategorized"),
                Collectors.summingDouble(t -> Optional.ofNullable(t.getAmount()).orElse(0.0))
        ));
        String topCat = byCat.entrySet().stream().max(Map.Entry.comparingByValue()).map(Map.Entry::getKey).orElse("N/A");

        YearMonth prev = month.minusMonths(1);
        List<Transaction> prevList = repo.findByDateBetween(prev.atDay(1), prev.atEndOfMonth());
        double prevTotal = prevList.stream().mapToDouble(t -> Optional.ofNullable(t.getAmount()).orElse(0.0)).sum();
        String delta = prevTotal == 0 ? "no prior data" : String.format("%+.1f%% vs %s", ((total - prevTotal) / prevTotal) * 100.0, prev);

        String topMerchant = current.stream()
                .collect(Collectors.groupingBy(t -> Optional.ofNullable(t.getMerchant()).orElse("Unknown"),
                        Collectors.summingDouble(t -> Optional.ofNullable(t.getAmount()).orElse(0.0))))
                .entrySet().stream().max(Map.Entry.comparingByValue()).map(Map.Entry::getKey).orElse("N/A");

        return String.format("%s total $%.2f (%s). Top category: %s. Biggest merchant: %s.",
                month, total, delta, topCat, topMerchant);
    }
}
