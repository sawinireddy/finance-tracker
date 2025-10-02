package com.example.finance.config;

import com.example.finance.model.Transaction;
import com.example.finance.repo.TransactionRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

@Configuration
public class DataLoader {

    @Bean
    CommandLineRunner seed(TransactionRepository repo) {
        return args -> {
            if (repo.count() > 0) return;
            try (var in = getClass().getResourceAsStream("/transactions.csv")) {
                if (in == null) return;
                try (var reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                    reader.lines().skip(1).forEach(line -> {
                        String[] t = line.split(",");
                        if (t.length >= 5) {
                            Transaction tx = Transaction.builder()
                                    .date(LocalDate.parse(t[0].trim()))
                                    .merchant(t[1].trim())
                                    .amount(parseDouble(t[2].trim()))
                                    .category(t[3].trim())
                                    .notes(t[4].trim())
                                    .build();
                            repo.save(tx);
                        }
                    });
                }
            }
        };
    }
    private Double parseDouble(String s) { try { return Double.parseDouble(s); } catch (Exception e) { return null; } }
}
