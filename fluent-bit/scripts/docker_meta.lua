-- Resolves Docker container names from the config.v2.json files that Docker
-- writes to /var/lib/docker/containers/<id>/config.v2.json.
-- This directory is already bind-mounted read-only, so no Docker socket is needed.
--
-- Results are cached for the lifetime of the Fluent Bit process so the file is
-- only read once per container.

local name_cache = {}

function enrich_docker_metadata(tag, timestamp, record)
    -- Tag format after Tag_Regex extraction: docker.<container_id>
    -- Extract the first long hex string from the tag (the container ID).
    local container_id = tag:match("docker%.([a-f0-9]+)")
    if not container_id or #container_id < 12 then
        return 0, timestamp, record
    end

    if name_cache[container_id] == nil then
        -- Docker stores container metadata in config.v2.json.
        -- The Name field looks like: "Name":"/container_name"
        local config_path = "/var/lib/docker/containers/" .. container_id .. "/config.v2.json"
        local f = io.open(config_path, "r")
        if f then
            local content = f:read("*a")
            f:close()
            local name = content:match('"Name"%s*:%s*"/?([^"]+)"')
            if name and #name > 0 then
                name_cache[container_id] = name
            else
                name_cache[container_id] = container_id:sub(1, 12)
            end
        else
            name_cache[container_id] = container_id:sub(1, 12)
        end
    end

    record["container_name"] = name_cache[container_id]
    return 1, timestamp, record
end
