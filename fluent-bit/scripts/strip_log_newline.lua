-- Strips the trailing newline that Docker's json-file log driver appends to
-- every log line.  The 'log' field arrives as:
--
--   {"event_type":"request_completed","level":"info",...}\n
--
-- That trailing \n causes Fluent Bit's JSON parser filter to fail silently,
-- leaving the whole string unparsed.  This filter runs first so the parser
-- filter receives clean JSON.

function strip_log_newline(tag, timestamp, record)
    if type(record["log"]) == "string" then
        record["log"] = record["log"]:gsub("%s+$", "")
    end
    return 1, timestamp, record
end
